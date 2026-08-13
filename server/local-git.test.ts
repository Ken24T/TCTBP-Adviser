import {
  chmod,
  lstat,
  mkdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BoundedGitExecutor,
  type GitCommand,
  type GitCommandResult,
  type GitExecutor,
} from './git-command'
import { LocalGitInspector, parseGitHubRemote } from './local-git'
import {
  createGitRepository,
  createTemporaryDirectory,
  git,
} from '../test/helpers'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('local Git inspector', () => {
  it('observes a dirty repository without fetching or mutating it', async () => {
    const repository = await temporaryRepository()
    await writeFile(path.join(repository, 'README.md'), '# Modified\n')
    await writeFile(path.join(repository, 'untracked.txt'), 'new\n')
    const inspector = new LocalGitInspector(
      new BoundedGitExecutor(3_000, 1024 * 1024),
    )

    const observation = await inspector.inspect(repository)

    expect(observation).toMatchObject({
      branch: 'development',
      detached: false,
      pathCount: 2,
      counts: {
        staged: 0,
        modified: 1,
        untracked: 1,
        conflicted: 0,
      },
      operations: [],
    })
    expect(git(repository, ['status', '--porcelain'])).toContain('README.md')
  })

  it('recognises detached HEAD and active-operation markers', async () => {
    const repository = await temporaryRepository()
    const sha = git(repository, ['rev-parse', 'HEAD'])
    git(repository, ['checkout', '--detach', sha])
    await writeFile(path.join(repository, '.git', 'MERGE_HEAD'), `${sha}\n`)
    await mkdir(path.join(repository, '.git', 'rebase-merge'))
    await writeFile(path.join(repository, 'README.md'), '# Dirty operation\n')
    const inspector = new LocalGitInspector(
      new BoundedGitExecutor(3_000, 1024 * 1024),
    )

    const observation = await inspector.inspect(repository)

    expect(observation.detached).toBe(true)
    expect(observation.branch).toBeNull()
    expect(observation.operations).toEqual(['merge', 'rebase'])
    expect(observation.counts.modified).toBe(1)
  })

  it('calls only the service-owned command descriptors', async () => {
    const executor = new RecordingExecutor()
    const inspector = new LocalGitInspector(executor)
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    executor.root = root

    await inspector.inspect(root)

    expect(executor.commandIds.sort()).toEqual([
      'git-dir',
      'origin-url',
      'status',
      'top-level',
    ])
  })

  it.runIf(process.platform !== 'win32')(
    'overrides a repository-configured filesystem monitor',
    async () => {
      const repository = await temporaryRepository()
      const sentinel = path.join(repository, 'fsmonitor-executed.txt')
      const monitor = path.join(repository, 'malicious-fsmonitor.sh')
      await writeFile(
        monitor,
        `#!/bin/sh\nprintf bad > ${JSON.stringify(sentinel)}\n`,
      )
      await chmod(monitor, 0o700)
      git(repository, ['config', 'core.fsmonitor', monitor])
      const inspector = new LocalGitInspector(
        new BoundedGitExecutor(3_000, 1024 * 1024),
      )

      await inspector.inspect(repository)

      await expect(lstat(sentinel)).rejects.toMatchObject({ code: 'ENOENT' })
    },
  )

  it('rejects configuration that points at a repository subdirectory', async () => {
    const repository = await temporaryRepository()
    const nested = path.join(repository, 'nested')
    await mkdir(nested)
    const inspector = new LocalGitInspector(
      new BoundedGitExecutor(3_000, 1024 * 1024),
    )

    await expect(inspector.inspect(nested)).rejects.toMatchObject({
      code: 'configured-path-not-repository-root',
    })
  })

  it.runIf(process.platform !== 'win32')(
    'accepts a linked git worktree whose git directory lives outside the worktree directory',
    async () => {
      const main = await temporaryRepository()
      git(main, ['remote', 'add', 'origin', 'https://github.com/example/kindling.git'])
      const worktreesRoot = path.join(path.dirname(main), 'worktrees')
      await mkdir(worktreesRoot, { recursive: true })
      temporaryDirectories.push(worktreesRoot)
      const worktree = path.join(worktreesRoot, 'feature-worktree')
      git(main, ['worktree', 'add', '-b', 'feature', worktree])
      const inspector = new LocalGitInspector(
        new BoundedGitExecutor(3_000, 1024 * 1024),
      )

      const observation = await inspector.inspect(worktree)

      expect(observation).toMatchObject({
        branch: 'feature',
        detached: false,
        remoteOrigin: 'https://github.com/example/kindling.git',
        operations: [],
      })
    },
  )

  it.runIf(process.platform !== 'win32')(
    'still rejects a git directory that escapes the repository via a symlinked .git',
    async () => {
      const real = await temporaryRepository()
      const parent = await createTemporaryDirectory()
      temporaryDirectories.push(parent)
      const repository = path.join(parent, 'repo')
      await mkdir(repository, { recursive: true })
      await symlink(path.join(real, '.git'), path.join(repository, '.git'))
      const inspector = new LocalGitInspector(
        new BoundedGitExecutor(3_000, 1024 * 1024),
      )

      await expect(inspector.inspect(repository)).rejects.toMatchObject({
        code: 'git-dir-outside-repository',
      })
    },
  )
})

describe('GitHub origin parser', () => {
  it.each([
    ['https://github.com/Ken24T/TCTBP-Adviser.git', 'Ken24T/TCTBP-Adviser'],
    ['git@github.com:Ken24T/TCTBP-Adviser.git', 'Ken24T/TCTBP-Adviser'],
    ['ssh://git@github.com/Ken24T/TCTBP-Adviser', 'Ken24T/TCTBP-Adviser'],
  ])('maps supported GitHub remotes', (remote, fullName) => {
    expect(parseGitHubRemote(remote)).toMatchObject({ fullName })
  })

  it.each([
    'https://gitlab.com/Ken24T/TCTBP-Adviser.git',
    'https://github.com/Ken24T/nested/TCTBP-Adviser.git',
    'file:///safe/TCTBP-Adviser',
    'not-a-url',
  ])('rejects unsupported or malformed remotes', (remote) => {
    expect(parseGitHubRemote(remote)).toBeNull()
  })
})

class RecordingExecutor implements GitExecutor {
  root = ''
  commandIds: string[] = []

  async run(
    _repositoryPath: string,
    command: GitCommand,
  ): Promise<GitCommandResult> {
    this.commandIds.push(command.id)
    if (command.id === 'status') {
      return {
        stdout: [
          '# branch.oid abc123',
          '# branch.head development',
        ].join('\0'),
        stderr: '',
      }
    }
    return { stdout: `${this.root}\n`, stderr: '' }
  }
}

async function temporaryRepository(): Promise<string> {
  const root = await createTemporaryDirectory()
  temporaryDirectories.push(root)
  return createGitRepository(root)
}
