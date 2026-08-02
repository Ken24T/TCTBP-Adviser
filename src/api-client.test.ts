import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PortfolioSnapshot } from '../shared/portfolio'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import {
  applyTctbpUpgradePlan,
  loadPortfolio,
  loadReferenceCatalogue,
  loadRepositoryDetail,
  loadTctbpUpgradePlan,
} from './api-client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('repository detail client', () => {
  it('requests an explicitly confirmed additions-only apply', async () => {
    const result = {
      status: 'applied',
      appliedPaths: ['scripts/tctbp-core.js'],
      planFingerprint: 'a'.repeat(64),
      committed: false,
      pushed: false,
    } as const
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(result))
    vi.stubGlobal('fetch', fetchMock)

    await expect(applyTctbpUpgradePlan(
      'opaque-id',
      'a'.repeat(64),
      'review-id',
      'additions-only',
    )).resolves.toStrictEqual(result)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/repositories/opaque-id/tctbp-apply',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          confirm: true,
          aiReviewId: 'review-id',
          aiReviewAcknowledged: true,
          planFingerprint: 'a'.repeat(64),
          mode: 'additions-only',
          approvedPaths: [],
          approvedDeletionPaths: [],
          confirmDeletions: false,
        }),
      }),
    )
  })

  it('requests a read-only canonical TCTBP upgrade plan', async () => {
    const plan = {
      disposition: 'source-unavailable',
      sourceAlignment: 'unknown',
      actionCounts: { preserve: 0, add: 0, review: 0, unavailable: 0 },
      blockers: [],
      policy: {
        state: 'unavailable',
        differences: [],
      },
      source: {
        state: 'not-configured',
        repository: null,
        revision: null,
        version: null,
        managedFileCount: 0,
        message: 'Not configured',
      },
      target: {
        sourceRepository: null,
        sourceRevision: null,
        sourceVersion: null,
      },
      drift: {
        files: [],
        counts: {
          current: 0,
          'missing-target': 0,
          drifted: 0,
          'source-unavailable': 0,
        },
      },
    } satisfies TctbpUpgradePlan
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(plan))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadTctbpUpgradePlan('opaque-id')).resolves.toStrictEqual(plan)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/repositories/opaque-id/tctbp-upgrade-plan',
      expect.objectContaining({ method: 'POST' }),
    )
  })

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
