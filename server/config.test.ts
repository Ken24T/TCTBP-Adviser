import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import { loadServiceConfig } from './config'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('portfolio service configuration', () => {
  it('loads and canonicalises multiple JSON-configured roots', async () => {
    const base = await temporaryRoot()
    const first = path.join(base, 'first')
    const second = path.join(base, 'second')
    await Promise.all([mkdir(first), mkdir(second)])

    const config = await loadServiceConfig({
      TCTBP_ADVISER_REPOSITORY_ROOTS: JSON.stringify([first, second, first]),
      TCTBP_ADVISER_EXCLUDE_DIRECTORIES: '["node_modules","archive"]',
      TCTBP_ADVISER_MAXIMUM_DEPTH: '4',
      TCTBP_ADVISER_MAXIMUM_DIRECTORIES: '500',
      TCTBP_ADVISER_MAXIMUM_REPOSITORIES: '50',
      TCTBP_ADVISER_CACHE_TTL_MS: '10000',
      TCTBP_ADVISER_INSPECTION_CONCURRENCY: '2',
    })

    expect(config.repositoryRoots).toEqual([first, second])
    expect(config.excludeDirectories).toEqual([
      '.git',
      'node_modules',
      'archive',
    ])
    expect(config).toMatchObject({
      maximumDepth: 4,
      maximumDirectories: 500,
      maximumRepositories: 50,
      portfolioCacheTtlMs: 10_000,
      inspectionConcurrency: 2,
    })
  })

  it('supports and validates the previous single-repository environment', async () => {
    const root = await temporaryRoot()
    const repository = path.join(root, 'repository')
    await mkdir(repository)

    const config = await loadServiceConfig({
      TCTBP_ADVISER_ALLOWED_ROOT: root,
      TCTBP_ADVISER_REPOSITORY: repository,
    })

    expect(config.repositoryRoots).toEqual([root])
  })

  it('rejects path-like exclusion entries and unsafe bounds', async () => {
    const root = await temporaryRoot()

    await expect(loadServiceConfig({
      TCTBP_ADVISER_REPOSITORY_ROOTS: JSON.stringify([root]),
      TCTBP_ADVISER_EXCLUDE_DIRECTORIES: '["../outside"]',
    })).rejects.toMatchObject({ code: 'configuration-invalid' })
    await expect(loadServiceConfig({
      TCTBP_ADVISER_REPOSITORY_ROOTS: JSON.stringify([root]),
      TCTBP_ADVISER_MAXIMUM_DEPTH: '99',
    })).rejects.toMatchObject({ code: 'configuration-invalid' })
  })

  it('loads bounded, optional server-side GitHub enrichment settings', async () => {
    const root = await temporaryRoot()

    const config = await loadServiceConfig({
      TCTBP_ADVISER_REPOSITORY_ROOTS: JSON.stringify([root]),
      TCTBP_ADVISER_GITHUB_ENABLED: 'true',
      TCTBP_ADVISER_GITHUB_TOKEN: ' server-secret ',
      TCTBP_ADVISER_GITHUB_REPOSITORIES:
        '["Ken24T/TCTBP-Adviser","ken24t/tctbp-adviser","Ken24T/TCTBP-Web"]',
      TCTBP_ADVISER_GITHUB_TIMEOUT_MS: '4000',
      TCTBP_ADVISER_GITHUB_MAX_RESPONSE_BYTES: '4096',
      TCTBP_ADVISER_GITHUB_CACHE_TTL_MS: '45000',
      TCTBP_ADVISER_GITHUB_CONCURRENCY: '2',
    })

    expect(config.github).toEqual({
      enabled: true,
      token: 'server-secret',
      repositories: ['ken24t/tctbp-adviser', 'Ken24T/TCTBP-Web'],
      timeoutMs: 4_000,
      maxResponseBytes: 4_096,
      cacheTtlMs: 45_000,
      concurrency: 2,
    })
  })

  it('rejects malformed GitHub repository and boolean configuration', async () => {
    const root = await temporaryRoot()
    const base = {
      TCTBP_ADVISER_REPOSITORY_ROOTS: JSON.stringify([root]),
    }

    await expect(loadServiceConfig({
      ...base,
      TCTBP_ADVISER_GITHUB_ENABLED: 'yes',
    })).rejects.toMatchObject({ code: 'configuration-invalid' })
    await expect(loadServiceConfig({
      ...base,
      TCTBP_ADVISER_GITHUB_REPOSITORIES: '["not-a-full-name"]',
    })).rejects.toMatchObject({ code: 'configuration-invalid' })
  })
})

async function temporaryRoot(): Promise<string> {
  const root = await createTemporaryDirectory()
  temporaryDirectories.push(root)
  return root
}
