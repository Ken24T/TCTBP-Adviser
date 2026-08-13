import { describe, expect, it } from 'vitest'
import type { GitHubConfig } from './config'
import { GitHubAccessService } from './github-access'

function config(token: string | null): GitHubConfig {
  return {
    enabled: true,
    token,
    repositories: [],
    timeoutMs: 5_000,
    maxResponseBytes: 2_097_152,
    cacheTtlMs: 60_000,
    concurrency: 3,
  }
}

function clientReturning(
  user: { login: string | null; name: string | null },
  scopes: string[],
) {
  return {
    readUser: async () => ({ user, scopes }),
  } as unknown as ConstructorParameters<typeof GitHubAccessService>[1]
}

describe('GitHub access service', () => {
  it('reports a missing token as unconfigured', async () => {
    const service = new GitHubAccessService(
      config(null),
      clientReturning({ login: null, name: null }, []),
    )

    const status = await service.status()

    expect(status).toMatchObject({
      configured: false,
      authenticated: false,
      account: null,
      canCreateRepositories: false,
    })
    expect(status.message).toBe('No GitHub token is configured.')
  })

  it('reports the connected account and repo-scoped write capability', async () => {
    const service = new GitHubAccessService(
      config('token'),
      clientReturning({ login: 'Ken24T', name: 'Ken' }, ['repo', 'workflow']),
    )

    const status = await service.status()

    expect(status).toMatchObject({
      configured: true,
      authenticated: true,
      account: { login: 'Ken24T', name: 'Ken' },
      canCreateRepositories: true,
      message: null,
    })
    expect(status.scopes).toEqual(['repo', 'workflow'])
  })

  it('reports fine-grained tokens (no scopes header) as unknown capability', async () => {
    const service = new GitHubAccessService(
      config('token'),
      clientReturning({ login: 'Ken24T', name: null }, []),
    )

    const status = await service.status()

    expect(status.authenticated).toBe(true)
    expect(status.canCreateRepositories).toBeNull()
    expect(status.account).toEqual({ login: 'Ken24T', name: null })
  })

  it('reports an authentication failure without exposing the token', async () => {
    const failing = {
      readUser: async () => {
        throw new Error('GitHub access was denied.')
      },
    } as unknown as ConstructorParameters<typeof GitHubAccessService>[1]
    const service = new GitHubAccessService(config('secret-token'), failing)

    const status = await service.status()

    expect(status).toMatchObject({
      configured: true,
      authenticated: false,
      account: null,
      canCreateRepositories: false,
    })
    expect(JSON.stringify(status)).not.toContain('secret-token')
    expect(status.message).toContain('GitHub access was denied.')
  })
})
