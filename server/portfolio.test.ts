import { describe, expect, it, vi } from 'vitest'
import type { ServiceConfig } from './config'
import type { RepositoryInspectionService } from './inspection'
import { PortfolioService } from './portfolio'
import type {
  RegisteredRepository,
  RepositoryRegistry,
} from './registry'
import { observationFixture } from '../test/observation-fixture'
import type { GitHubEnrichmentService } from './github-enrichment'

describe('portfolio snapshot service', () => {
  it('isolates repository failures and preserves healthy summaries', async () => {
    const repositories = [
      registered('healthy', 'Healthy'),
      registered('broken', 'Broken'),
    ]
    const inspect = vi.fn(async (repository: RegisteredRepository) => {
      if (repository.id === 'broken') throw new Error('private detail')
      return {
        ...observationFixture(),
        repository: { id: repository.id, name: repository.name },
      }
    })
    const service = createService(repositories, inspect)

    const snapshot = await service.get()

    expect(snapshot.repositories).toHaveLength(2)
    expect(snapshot.repositories[0]).toMatchObject({
      id: 'healthy',
      available: true,
      error: null,
    })
    expect(snapshot.repositories[1]).toMatchObject({
      id: 'broken',
      available: false,
      error: {
        code: 'inspection-failed',
        message: 'Local repository inspection failed safely.',
      },
    })
    expect(JSON.stringify(snapshot)).not.toContain('private detail')
  })

  it('reuses fresh snapshots and refreshes only when requested', async () => {
    const inspect = vi.fn(async (repository: RegisteredRepository) => ({
      ...observationFixture(),
      repository: { id: repository.id, name: repository.name },
    }))
    const service = createService([registered('one', 'One')], inspect)

    const first = await service.get()
    const second = await service.get()
    const refreshed = await service.get(true)

    expect(first.cache.status).toBe('refreshed')
    expect(second.cache.status).toBe('fresh')
    expect(refreshed.cache.status).toBe('refreshed')
    expect(inspect).toHaveBeenCalledTimes(2)
  })

  it('invalidates the cached snapshot so the next read re-inspects', async () => {
    const inspect = vi.fn(async (repository: RegisteredRepository) => ({
      ...observationFixture(),
      repository: { id: repository.id, name: repository.name },
    }))
    const service = createService([registered('one', 'One')], inspect)

    const first = await service.get()
    const second = await service.get()
    service.invalidate()
    const third = await service.get()

    expect(first.cache.status).toBe('refreshed')
    expect(second.cache.status).toBe('fresh')
    expect(third.cache.status).toBe('refreshed')
    expect(inspect).toHaveBeenCalledTimes(2)
  })

  it('preserves local advice when GitHub enrichment rejects', async () => {
    const inspect = vi.fn(async (repository: RegisteredRepository) => ({
      ...observationFixture(),
      repository: { id: repository.id, name: repository.name },
    }))
    const github = {
      forLocal: vi.fn(async () => {
        throw new Error('provider detail')
      }),
      githubOnly: vi.fn(async () => []),
    } as unknown as GitHubEnrichmentService
    const service = createService(
      [registered('one', 'One')],
      inspect,
      github,
    )

    const snapshot = await service.get()

    expect(snapshot.repositories[0]).toMatchObject({
      available: true,
      source: 'local',
      github: { status: 'not-mapped' },
    })
    expect(snapshot.repositories[0].recommendation).not.toBeNull()
    expect(JSON.stringify(snapshot)).not.toContain('provider detail')
  })

  it('refreshes a single repository and preserves the other summaries', async () => {
    const repositories = [
      registered('one', 'One'),
      registered('two', 'Two'),
    ]
    const inspect = vi.fn(async (repository: RegisteredRepository) => ({
      ...observationFixture(),
      repository: { id: repository.id, name: repository.name },
    }))
    const service = createService(repositories, inspect)

    const initial = await service.get()
    expect(initial.repositories[0].workingTree).toEqual({ clean: true, pathCount: 0 })

    // The next inspection of 'one' observes a dirty working tree.
    inspect.mockImplementation(async (repository: RegisteredRepository) => ({
      ...observationFixture({ clean: false }),
      repository: { id: repository.id, name: repository.name },
    }))
    const refreshed = await service.refreshRepository('one')

    expect(refreshed.repositories).toHaveLength(2)
    expect(refreshed.repositories[0].workingTree).toEqual({
      clean: false,
      pathCount: 1,
    })
    expect(refreshed.repositories[1].workingTree).toEqual({
      clean: true,
      pathCount: 0,
    })
    expect(refreshed.cache.status).toBe('refreshed')
  })

  it('requires a registered repository for a single-repo refresh', async () => {
    const inspect = vi.fn(async (repository: RegisteredRepository) => ({
      ...observationFixture(),
      repository: { id: repository.id, name: repository.name },
    }))
    const service = createService([registered('one', 'One')], inspect)

    await expect(service.refreshRepository('missing')).rejects.toThrow()
    expect(inspect).not.toHaveBeenCalled()
  })

  it('refreshes a single mutated repository without re-inspecting the others', async () => {
    const repositories = [
      registered('one', 'One'),
      registered('two', 'Two'),
    ]
    const inspect = vi.fn(async (repository: RegisteredRepository) => ({
      ...observationFixture(),
      repository: { id: repository.id, name: repository.name },
    }))
    const service = createService(repositories, inspect)

    await service.get()
    expect(inspect).toHaveBeenCalledTimes(2)

    inspect.mockImplementation(async (repository: RegisteredRepository) => ({
      ...observationFixture({ clean: false }),
      repository: { id: repository.id, name: repository.name },
    }))
    await service.refreshAfterMutation('one')

    expect(inspect).toHaveBeenCalledTimes(3)
    const snapshot = await service.get()
    expect(snapshot.cache.status).toBe('fresh')
    expect(snapshot.repositories[0].workingTree).toEqual({
      clean: false,
      pathCount: 1,
    })
    expect(snapshot.repositories[1].workingTree).toEqual({
      clean: true,
      pathCount: 0,
    })
    expect(inspect).toHaveBeenCalledTimes(3)
  })

  it('waits for a settling mutation refresh before serving the snapshot', async () => {
    const repositories = [
      registered('one', 'One'),
      registered('two', 'Two'),
    ]
    const inspect = vi.fn(async (repository: RegisteredRepository) => ({
      ...observationFixture(),
      repository: { id: repository.id, name: repository.name },
    }))
    const service = createService(repositories, inspect)

    await service.get()
    inspect.mockImplementation(async (repository: RegisteredRepository) => ({
      ...observationFixture({ clean: false }),
      repository: { id: repository.id, name: repository.name },
    }))

    // Deliberately not awaited: a concurrent read must still see its result.
    void service.refreshAfterMutation('one')
    const snapshot = await service.get()

    expect(snapshot.cache.status).toBe('fresh')
    expect(snapshot.repositories[0].workingTree).toEqual({
      clean: false,
      pathCount: 1,
    })
    expect(snapshot.repositories[1].workingTree).toEqual({
      clean: true,
      pathCount: 0,
    })
  })

  it('falls back to a full refresh when a post-mutation refresh cannot run', async () => {
    const inspect = vi.fn(async (repository: RegisteredRepository) => ({
      ...observationFixture(),
      repository: { id: repository.id, name: repository.name },
    }))
    const service = createService([registered('one', 'One')], inspect)

    const first = await service.get()
    expect(first.cache.status).toBe('refreshed')

    await service.refreshAfterMutation('missing')

    const next = await service.get()
    expect(next.cache.status).toBe('refreshed')
    expect(inspect).toHaveBeenCalledTimes(2)
  })
})

function createService(
  repositories: RegisteredRepository[],
  inspect: (repository: RegisteredRepository) => Promise<ReturnType<
    typeof observationFixture
  >>,
  githubOverride?: GitHubEnrichmentService,
): PortfolioService {
  const registry = {
    snapshot: vi.fn(async () => ({
      scannedAt: '2026-07-30T05:00:00.000Z',
      repositories,
      issues: [],
    })),
    require: vi.fn(async (id: string) => {
      const repository = repositories.find((candidate) => candidate.id === id)
      if (!repository) throw new Error(`unknown repository ${id}`)
      return repository
    }),
  } as unknown as RepositoryRegistry
  const inspections = { inspect } as unknown as RepositoryInspectionService
  const github = githubOverride ?? {
    forLocal: vi.fn(async () => ({
      status: 'disabled',
      basis: 'github-rest-api',
      retrievedAt: null,
    })),
    githubOnly: vi.fn(async () => []),
  } as unknown as GitHubEnrichmentService
  return new PortfolioService(config(), registry, inspections, github)
}

function registered(id: string, name: string): RegisteredRepository {
  return { id, name, path: `/safe/${name}` }
}

function config(): ServiceConfig {
  return {
    repositoryRoots: ['/safe'],
    excludeDirectories: ['.git'],
    maximumDepth: 3,
    maximumDirectories: 5_000,
    maximumRepositories: 200,
    portfolioCacheTtlMs: 30_000,
    inspectionConcurrency: 2,
    commandTimeoutMs: 3_000,
    commandMaxOutputBytes: 1024,
    github: {
      enabled: false,
      token: null,
      repositories: [],
      timeoutMs: 5_000,
      maxResponseBytes: 2_097_152,
      cacheTtlMs: 60_000,
      concurrency: 3,
    },
  }
}
