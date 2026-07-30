import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import { loadRepositoryDetail } from './api-client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('repository detail client', () => {
  it('selects the opaque configured repository and sends only a fixed intent', async () => {
    const detail = {
      observation: {},
      recommendation: {},
    } as RepositoryDetailResult
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        repositories: [{ id: 'opaque-id', name: 'TCTBP-Adviser' }],
      }))
      .mockResolvedValueOnce(jsonResponse(detail))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadRepositoryDetail('continue-on-another-machine'))
      .resolves.toStrictEqual(detail)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
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

    await expect(loadRepositoryDetail('none')).rejects.toThrow(
      'The configured repository is unavailable.',
    )
  })
})

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
