import { describe, expect, it, vi } from 'vitest'
import type { ServiceConfig } from './config'
import type { RepositoryInspectionService } from './inspection'
import { PortfolioService } from './portfolio'
import type {
  RegisteredRepository,
  RepositoryRegistry,
} from './registry'
import { observationFixture } from '../test/observation-fixture'

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
})

function createService(
  repositories: RegisteredRepository[],
  inspect: (repository: RegisteredRepository) => Promise<ReturnType<
    typeof observationFixture
  >>,
): PortfolioService {
  const registry = {
    snapshot: vi.fn(async () => ({
      scannedAt: '2026-07-30T05:00:00.000Z',
      repositories,
      issues: [],
    })),
  } as unknown as RepositoryRegistry
  const inspections = { inspect } as unknown as RepositoryInspectionService
  return new PortfolioService(config(), registry, inspections)
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
  }
}
