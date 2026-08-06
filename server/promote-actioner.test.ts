import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
import { PromoteActioner } from './promote-actioner'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('promote review Actioner', () => {
  it('executes the TCTBP promote review workflow and reports the result', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)
    await mkdir(`${repository}/scripts`)
    await writeFile(`${repository}/scripts/tctbp-run-promote.js`, 'process.exit(0)\n')
    git(repository, ['add', '-A'])
    git(repository, ['commit', '-m', 'test: add promote workflow'])
    git(repository, ['checkout', '-b', 'review'])
    git(repository, ['checkout', 'development'])
    const progress: string[] = []

    const result = await new PromoteActioner().run(
      repository,
      'development',
      (step, detail) => progress.push(`${step}:${detail}`),
    )

    expect(result).toMatchObject({
      workflowId: 'promote-review',
      branch: 'review',
      pushed: false,
      verifiedClean: true,
    })
    expect(result.commitSha).toHaveLength(40)
    expect(progress.some((entry) => entry.startsWith('execute:'))).toBe(true)
  })

  it('rejects when the current branch is not development', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)

    await expect(new PromoteActioner().run(
      repository,
      'main',
      () => undefined,
    )).rejects.toThrow('Promote review requires the development branch.')
  })
})
