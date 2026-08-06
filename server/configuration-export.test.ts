import { describe, expect, it } from 'vitest'
import type { ServiceConfig } from './config'
import { safeConfigurationExport } from './configuration-export'

describe('safe configuration export', () => {
  it('exports reconstructable limits while omitting roots and tokens', () => {
    const config: ServiceConfig = {
      repositoryRoots: ['/private/projects'],
      excludeDirectories: ['.git', 'node_modules'],
      maximumDepth: 3,
      maximumDirectories: 5_000,
      maximumRepositories: 200,
      portfolioCacheTtlMs: 30_000,
      inspectionConcurrency: 4,
      commandTimeoutMs: 3_000,
      commandMaxOutputBytes: 1_048_576,
      github: {
        enabled: true,
        token: 'secret-token',
        repositories: ['Ken24T/TCTBP-Adviser'],
        timeoutMs: 5_000,
        maxResponseBytes: 2_097_152,
        cacheTtlMs: 60_000,
        concurrency: 3,
      },
    }

    const exported = safeConfigurationExport(
      config,
      new Date('2026-07-30T02:00:00.000Z'),
    )
    const serialised = JSON.stringify(exported)

    expect(exported).toMatchObject({
      version: 1,
      generatedAt: '2026-07-30T02:00:00.000Z',
      discovery: {
        repositoryRootCount: 1,
        inspectionConcurrency: 4,
      },
      github: {
        enabled: true,
        tokenConfigured: true,
        configuredRepositoryCount: 1,
      },
      omissions: {
        repositoryPaths: true,
        githubToken: true,
      },
    })
    expect(serialised).not.toContain('/private/projects')
    expect(serialised).not.toContain('secret-token')
    expect(serialised).not.toContain('Ken24T/TCTBP-Adviser')
  })
})
