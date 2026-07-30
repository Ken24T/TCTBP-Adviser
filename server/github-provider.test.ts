import { describe, expect, it, vi } from 'vitest'
import type { GitHubConfig } from './config'
import type { GitHubRestClient } from './github-client'
import { GitHubProvider } from './github-provider'

const IDENTITY = {
  owner: 'Ken24T',
  name: 'TCTBP-Adviser',
  fullName: 'Ken24T/TCTBP-Adviser',
}

describe('GitHub provider observations', () => {
  it('returns timestamped provider evidence across every planned surface', async () => {
    const client = clientFixture()
    const provider = new GitHubProvider(
      { ...config(), token: 'server-secret' },
      client,
      () => new Date('2026-07-30T06:00:00.000Z'),
    )

    const result = await provider.observe(IDENTITY)

    expect(result).toMatchObject({
      status: 'available',
      basis: 'github-rest-api',
      retrievedAt: '2026-07-30T06:00:00.000Z',
      repository: {
        fullName: IDENTITY.fullName,
        defaultBranch: 'development',
        defaultBranchSha: 'development-sha',
      },
      branches: { totalCount: 2, status: 'available' },
      tags: { totalCount: 1, status: 'available' },
      releases: { totalCount: 1, status: 'available' },
      workflows: { totalCount: 1, status: 'available' },
      checks: { totalCount: 1, status: 'available' },
      pullRequests: { totalCount: 1, status: 'available' },
      issues: { totalCount: 1, status: 'available' },
    })
    if (result.status !== 'available') throw new Error('expected evidence')
    expect(result.issues.items.map((issue) => issue.number)).toEqual([12])
    expect(JSON.stringify(result)).not.toContain('server-secret')
  })

  it('keeps repository evidence when one provider surface fails', async () => {
    const client = clientFixture()
    vi.mocked(client.get).mockImplementation(async (path) => {
      if (path.includes('/actions/runs')) throw new Error('provider detail')
      return responseFor(path)
    })

    const result = await new GitHubProvider(config(), client)
      .observe(IDENTITY)

    expect(result.status).toBe('available')
    if (result.status !== 'available') throw new Error('expected evidence')
    expect(result.workflows).toMatchObject({
      status: 'unavailable',
      items: [],
      error: { code: 'inspection-failed' },
    })
    expect(result.branches.status).toBe('available')
  })

  it('degrades to unavailable without throwing when metadata fails', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('private detail')),
    } as unknown as GitHubRestClient

    await expect(new GitHubProvider(config(), client).observe(IDENTITY))
      .resolves.toMatchObject({
        status: 'unavailable',
        repository: { fullName: IDENTITY.fullName },
        error: { code: 'inspection-failed' },
      })
  })

  it('coalesces and caches observations until a forced refresh', async () => {
    const client = clientFixture()
    const provider = new GitHubProvider(config(), client)

    await Promise.all([
      provider.observe(IDENTITY),
      provider.observe(IDENTITY),
    ])
    await provider.observe(IDENTITY)
    await provider.observe(IDENTITY, true)

    expect(client.get).toHaveBeenCalledTimes(16)
  })
})

function clientFixture(): GitHubRestClient {
  return {
    get: vi.fn(async (path: string) => responseFor(path)),
  } as unknown as GitHubRestClient
}

function responseFor(path: string): unknown {
  if (path.endsWith('/TCTBP-Adviser')) {
    return {
      full_name: IDENTITY.fullName,
      html_url: 'https://github.com/Ken24T/TCTBP-Adviser',
      default_branch: 'development',
      visibility: 'public',
      archived: false,
      pushed_at: '2026-07-30T05:50:00Z',
    }
  }
  if (path.includes('/branches')) {
    return [
      branch('development', 'development-sha'),
      branch('main', 'main-sha'),
    ]
  }
  if (path.includes('/tags')) {
    return [{ name: 'v0.1.0', commit: { sha: 'tag-sha' } }]
  }
  if (path.includes('/releases')) {
    return [{
      name: 'First release',
      tag_name: 'v0.1.0',
      published_at: '2026-07-29T00:00:00Z',
      draft: false,
      prerelease: false,
    }]
  }
  if (path.includes('/actions/runs')) {
    return {
      total_count: 1,
      workflow_runs: [{
        name: 'CI',
        head_branch: 'development',
        head_sha: 'development-sha',
        status: 'completed',
        conclusion: 'success',
        updated_at: '2026-07-30T05:55:00Z',
      }],
    }
  }
  if (path.includes('/check-runs')) {
    return {
      total_count: 1,
      check_runs: [{
        name: 'test',
        head_sha: 'development-sha',
        status: 'completed',
        conclusion: 'success',
        completed_at: '2026-07-30T05:54:00Z',
      }],
    }
  }
  if (path.includes('/pulls')) {
    return [{
      number: 9,
      title: 'A pull request',
      draft: false,
      updated_at: '2026-07-30T05:53:00Z',
    }]
  }
  if (path.includes('/issues')) {
    return [
      {
        number: 9,
        title: 'PR represented as issue',
        updated_at: '2026-07-30T05:53:00Z',
        pull_request: {},
      },
      {
        number: 12,
        title: 'An issue',
        updated_at: '2026-07-30T05:52:00Z',
      },
    ]
  }
  throw new Error(`Unexpected path: ${path}`)
}

function branch(name: string, sha: string) {
  return { name, commit: { sha }, protected: false }
}

function config(): GitHubConfig {
  return {
    enabled: true,
    token: null,
    repositories: [],
    timeoutMs: 5_000,
    maxResponseBytes: 2_097_152,
    cacheTtlMs: 60_000,
    concurrency: 3,
  }
}
