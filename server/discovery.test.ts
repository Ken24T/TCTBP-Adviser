import {
  mkdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import type { ServiceConfig } from './config'
import { RepositoryDiscovery } from './discovery'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('bounded repository discovery', () => {
  it('finds repositories within depth and skips excluded directories', async () => {
    const root = await temporaryRoot()
    await repository(root, 'direct')
    await repository(path.join(root, 'group'), 'nested')
    await repository(path.join(root, 'node_modules'), 'excluded')
    await repository(path.join(root, 'archive'), 'archived')

    const snapshot = await new RepositoryDiscovery(config(root)).scan()

    expect(snapshot.repositories.map((item) => item.name))
      .toEqual(['direct', 'nested'])
    expect(JSON.stringify(snapshot)).not.toContain('excluded')
    expect(JSON.stringify(snapshot)).not.toContain('archived')
  })

  it('recognises worktree-style .git files', async () => {
    const root = await temporaryRoot()
    const worktree = path.join(root, 'worktree')
    await mkdir(worktree)
    await writeFile(path.join(worktree, '.git'), 'gitdir: ../metadata\n')

    const snapshot = await new RepositoryDiscovery(config(root)).scan()

    expect(snapshot.repositories).toHaveLength(1)
    expect(snapshot.repositories[0].name).toBe('worktree')
  })

  it('reconciles duplicate canonical repositories from overlapping roots', async () => {
    const root = await temporaryRoot()
    const nested = await repository(root, 'nested')
    const serviceConfig = {
      ...config(root),
      repositoryRoots: [root, nested],
    }

    const snapshot = await new RepositoryDiscovery(serviceConfig).scan()

    expect(snapshot.repositories).toHaveLength(1)
    expect(snapshot.repositories[0].path).toBe(nested)
  })

  it('enforces maximum depth and repository count', async () => {
    const root = await temporaryRoot()
    await repository(root, 'first')
    await repository(root, 'second')
    await repository(path.join(root, 'one', 'two'), 'too-deep')

    const snapshot = await new RepositoryDiscovery({
      ...config(root),
      maximumDepth: 2,
      maximumRepositories: 1,
    }).scan()

    expect(snapshot.repositories).toHaveLength(1)
    expect(snapshot.issues).toContainEqual({
      code: 'repository-limit-reached',
      message: 'Repository discovery stopped at the configured safety limit.',
    })
  })

  it('enforces the directory traversal limit', async () => {
    const root = await temporaryRoot()
    await Promise.all([
      mkdir(path.join(root, 'first')),
      mkdir(path.join(root, 'second')),
    ])

    const snapshot = await new RepositoryDiscovery({
      ...config(root),
      maximumDirectories: 1,
    }).scan()

    expect(snapshot.repositories).toEqual([])
    expect(snapshot.issues).toContainEqual({
      code: 'directory-limit-reached',
      message: 'Repository discovery stopped at the directory safety limit.',
    })
  })

  it.runIf(process.platform !== 'win32')(
    'does not follow directory symbolic links',
    async () => {
      const base = await temporaryRoot()
      const root = path.join(base, 'root')
      const outside = path.join(base, 'outside')
      await Promise.all([mkdir(root), repository(outside, 'linked-repository')])
      await symlink(outside, path.join(root, 'linked'), 'dir')

      const snapshot = await new RepositoryDiscovery(config(root)).scan()

      expect(snapshot.repositories).toEqual([])
    },
  )
})

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
    github: disabledGitHubConfig(),
  }
}

function disabledGitHubConfig(): ServiceConfig['github'] {
  return {
    enabled: false,
    token: null,
    repositories: [],
    timeoutMs: 5_000,
    maxResponseBytes: 2_097_152,
    cacheTtlMs: 60_000,
    concurrency: 3,
  }
}

async function repository(parent: string, name: string): Promise<string> {
  const repositoryPath = path.join(parent, name)
  await mkdir(path.join(repositoryPath, '.git'), { recursive: true })
  return repositoryPath
}

async function temporaryRoot(): Promise<string> {
  const root = await createTemporaryDirectory()
  temporaryDirectories.push(root)
  return root
}
