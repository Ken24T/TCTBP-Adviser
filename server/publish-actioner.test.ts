import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm } from 'node:fs/promises'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
import { PublishActioner } from './publish-actioner'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('publish Actioner', () => {
  it('publishes a clean branch and verifies the remote commit', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)
    const remote = `${root}/remote.git`
    git(root, ['init', '--bare', remote])
    git(repository, ['remote', 'add', 'origin', remote])
    git(repository, ['push', '-u', 'origin', 'development'])
    await mkdir(`${repository}/notes`)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(`${repository}/notes/change.md`, 'published work\n')
    git(repository, ['add', '-A'])
    git(repository, ['commit', '-m', 'test: unpublished change'])

    const result = await new PublishActioner().run(repository, 'development', () => undefined)

    expect(result).toMatchObject({
      workflowId: 'publish',
      branch: 'development',
      pushed: true,
      verifiedClean: true,
      remote,
      summary: 'Current branch published and remote commit verified.',
    })
    expect(git(remote, ['show-ref', '--hash', 'refs/heads/development'])).toBe(result.commitSha)
    expect(git(repository, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']))
      .toBe('origin/development')
  })
})
