import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PortfolioSnapshot } from '../shared/portfolio'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import {
  loadPortfolio,
  loadReferenceCatalogue,
  loadRepositoryDetail,
} from './api-client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('repository detail client', () => {
  it('selects the opaque configured repository and sends only a fixed intent', async () => {
    const detail = {
      observation: {},
      recommendation: {},
    } as RepositoryDetailResult
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(detail))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadRepositoryDetail(
      'opaque-id',
      'continue-on-another-machine',
    ))
      .resolves.toStrictEqual(detail)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/repositories/opaque-id/detail',
      expect.objectContaining({
        method: 'POST',
        body: '{"intent":"continue-on-another-machine"}',
      }),
    )
  })

  it('reports a safe service error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      jsonResponse({
        error: { message: 'The configured repository is unavailable.' },
      }, 500),
    ))

    await expect(loadRepositoryDetail('opaque-id', 'none')).rejects.toThrow(
      'The configured repository is unavailable.',
    )
  })

  it('uses distinct cached and force-refresh portfolio endpoints', async () => {
    const snapshot = {
      generatedAt: '2026-07-30T05:00:00.000Z',
      repositories: [],
      discovery: {
        scannedAt: '2026-07-30T05:00:00.000Z',
        repositoryCount: 0,
        rootCount: 1,
        issues: [],
      },
      github: {
        enabled: false,
        localMappings: 0,
        githubOnly: 0,
        unavailable: 0,
      },
      cache: { status: 'fresh', ageMs: 0, ttlMs: 30_000 },
    } satisfies PortfolioSnapshot
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(snapshot))
      .mockResolvedValueOnce(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    await loadPortfolio()
    await loadPortfolio(true)

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/portfolio',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/repositories/refresh',
      expect.objectContaining({
        credentials: 'same-origin',
        method: 'POST',
      }),
    )
  })

  it('loads the pinned reference from the same-origin API', async () => {
    const catalogue = {
      contract: {},
      workflows: [],
      guardrails: [],
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(catalogue))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadReferenceCatalogue()).resolves.toStrictEqual(catalogue)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalogue',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
  })
})

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
