import { describe, expect, it, vi } from 'vitest'
import { GitHubRestClient } from './github-client'

describe('bounded GitHub REST client', () => {
  it('uses only the fixed GitHub host and keeps authentication in headers', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    const client = new GitHubRestClient(config('server-secret'), request)

    await client.get('/repos/Ken24T/TCTBP-Adviser')

    expect(request).toHaveBeenCalledWith(
      'https://api.github.com/repos/Ken24T/TCTBP-Adviser',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: 'Bearer server-secret',
        }),
      }),
    )
  })

  it('rejects non-relative and oversized responses', async () => {
    const client = new GitHubRestClient(
      { ...config(null), maxResponseBytes: 8 },
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ tooLarge: true }), { status: 200 }),
      ),
    )

    await expect(client.get('https://evil.example')).rejects.toMatchObject({
      code: 'github-path-rejected',
    })
    await expect(client.get('/repos/owner/name')).rejects.toMatchObject({
      code: 'github-response-limit-exceeded',
    })
  })

  it('maps provider status without returning response bodies', async () => {
    const client = new GitHubRestClient(
      config(null),
      vi.fn().mockResolvedValue(
        new Response('private response detail', { status: 403 }),
      ),
    )

    await expect(client.get('/repos/owner/name')).rejects.toMatchObject({
      code: 'github-access-denied',
      message: 'GitHub access was denied.',
    })
  })
})

function config(token: string | null) {
  return {
    enabled: true,
    token,
    repositories: [],
    timeoutMs: 5_000,
    maxResponseBytes: 1024,
    cacheTtlMs: 60_000,
    concurrency: 3,
  }
}
