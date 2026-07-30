import { describe, expect, it, vi } from 'vitest'
import type { GitHubConfig } from './config'
import { GitHubEnrichmentService } from './github-enrichment'
import type { GitHubProvider } from './github-provider'
import type { LocalGitInspector } from './local-git'

describe('GitHub repository mapping', () => {
  it('maps a local origin and excludes the same configured remote', async () => {
    const observe = vi.fn(async (identity) => unavailable(identity.fullName))
    const service = new GitHubEnrichmentService(
      config(['Ken24T/TCTBP-Adviser', 'Ken24T/TCTBP-Web']),
      {
        githubIdentity: vi.fn(async () => ({
          owner: 'Ken24T',
          name: 'TCTBP-Adviser',
          fullName: 'Ken24T/TCTBP-Adviser',
        })),
      } as unknown as LocalGitInspector,
      { observe } as unknown as GitHubProvider,
    )

    const local = await service.forLocal({
      id: 'local-id',
      name: 'TCTBP-Adviser',
      path: '/safe/TCTBP-Adviser',
    })
    const remote = await service.githubOnly(
      new Set(['ken24t/tctbp-adviser']),
    )

    expect(local).toMatchObject({
      status: 'unavailable',
      repository: { fullName: 'Ken24T/TCTBP-Adviser' },
    })
    expect(remote).toHaveLength(1)
    expect(remote[0]).toMatchObject({
      name: 'TCTBP-Web',
      evidence: {
        repository: { fullName: 'Ken24T/TCTBP-Web' },
      },
    })
    expect(remote[0].id).toMatch(/^[A-Za-z0-9_-]{24}$/)
  })

  it('leaves local repositories usable when enrichment is disabled', async () => {
    const service = new GitHubEnrichmentService(
      { ...config([]), enabled: false },
      {} as LocalGitInspector,
      {} as GitHubProvider,
    )

    await expect(service.forLocal({
      id: 'local-id',
      name: 'local',
      path: '/safe/local',
    })).resolves.toMatchObject({
      status: 'disabled',
      retrievedAt: null,
    })
    await expect(service.githubOnly(new Set())).resolves.toEqual([])
  })

  it('labels an enabled local-only repository without calling GitHub', async () => {
    const observe = vi.fn()
    const service = new GitHubEnrichmentService(
      config([]),
      {
        githubIdentity: vi.fn(async () => null),
      } as unknown as LocalGitInspector,
      { observe } as unknown as GitHubProvider,
    )

    await expect(service.forLocal({
      id: 'local-id',
      name: 'local-only',
      path: '/safe/local-only',
    })).resolves.toMatchObject({
      status: 'not-mapped',
      retrievedAt: null,
    })
    expect(observe).not.toHaveBeenCalled()
  })
})

function unavailable(fullName: string) {
  return {
    status: 'unavailable',
    basis: 'github-rest-api',
    retrievedAt: '2026-07-30T06:00:00.000Z',
    repository: { fullName },
    error: { code: 'github-test', message: 'Unavailable for test.' },
  } as const
}

function config(repositories: string[]): GitHubConfig {
  return {
    enabled: true,
    token: null,
    repositories,
    timeoutMs: 5_000,
    maxResponseBytes: 2_097_152,
    cacheTtlMs: 60_000,
    concurrency: 2,
  }
}
