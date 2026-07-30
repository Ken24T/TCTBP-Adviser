import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import type { ServiceConfig } from './config'
import { RepositoryDiscovery } from './discovery'
import { RepositoryRegistry } from './registry'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('repository registry', () => {
  it('returns stable opaque IDs without exposing canonical paths', async () => {
    const root = await temporaryRoot()
    const repositoryPath = path.join(root, 'TCTBP-Web')
    await mkdir(path.join(repositoryPath, '.git'), { recursive: true })
    const first = registry(config(root))
    const second = registry(config(root))
    const [repository] = await first.list()
    const [sameRepository] = await second.list()

    expect(repository.name).toBe('TCTBP-Web')
    expect(repository.id).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(repository.id).toBe(sameRepository.id)
    expect(JSON.stringify(repository)).not.toContain(root)
    expect((await first.require(repository.id)).path).toBe(repositoryPath)
  })

  it('rejects an unknown opaque ID', async () => {
    const root = await temporaryRoot()
    await expect(registry(config(root)).require('not-registered'))
      .rejects.toMatchObject({ code: 'repository-not-found' })
  })
})

function registry(serviceConfig: ServiceConfig): RepositoryRegistry {
  return new RepositoryRegistry(
    new RepositoryDiscovery(serviceConfig),
    serviceConfig.portfolioCacheTtlMs,
  )
}

function config(root: string): ServiceConfig {
  return {
    repositoryRoots: [root],
    excludeDirectories: ['.git', 'node_modules', 'dist', 'build', 'archive'],
    maximumDepth: 3,
    maximumDirectories: 5_000,
    maximumRepositories: 200,
    portfolioCacheTtlMs: 30_000,
    inspectionConcurrency: 4,
    commandTimeoutMs: 3_000,
    commandMaxOutputBytes: 1024,
  }
}

async function temporaryRoot(): Promise<string> {
  const root = await createTemporaryDirectory()
  temporaryDirectories.push(root)
  return root
}
