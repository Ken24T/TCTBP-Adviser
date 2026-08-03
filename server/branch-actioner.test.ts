import { afterEach, describe, expect, it } from 'vitest'
import { rm, writeFile } from 'node:fs/promises'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
import { BranchActioner } from './branch-actioner'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('branch Actioner', () => {
  it('creates and switches to development without publishing', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)
    git(repository, ['switch', '-c', 'upgrade/bootstrap'])
    git(repository, ['branch', '-D', 'development'])
    await writeFile(`${repository}/README.md`, '# Changed\n')
    git(repository, ['add', 'README.md'])
    git(repository, ['commit', '-m', 'test: bootstrap baseline'])

    const result = await new BranchActioner().run(repository, 'upgrade/bootstrap', () => undefined)

    expect(result).toMatchObject({
      workflowId: 'branch-development',
      branch: 'development',
      pushed: false,
      summary: 'Development branch created locally; publish it before deployment.',
    })
    expect(git(repository, ['branch', '--show-current'])).toBe('development')
  })
})
