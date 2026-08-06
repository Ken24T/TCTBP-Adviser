import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
import { PromoteActioner } from './promote-actioner'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function makeReviewActioner() {
  return new PromoteActioner({
    workflowId: 'promote-review',
    key: 'review',
    sourceBranch: 'development',
    targetBranch: 'review',
    publishTarget: true,
  })
}

function makeProductionActioner() {
  return new PromoteActioner({
    workflowId: 'promote-production',
    key: 'production',
    sourceBranch: 'review',
    targetBranch: 'main',
    publishTarget: false,
  })
}

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

    const result = await makeReviewActioner().run(
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

    await expect(makeReviewActioner().run(
      repository,
      'main',
      () => undefined,
    )).rejects.toThrow('Promote review requires the development branch.')
  })
})

describe('promote production Actioner', () => {
  it('executes the TCTBP promote production workflow and reports the result', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)
    await mkdir(`${repository}/scripts`)
    await writeFile(`${repository}/scripts/tctbp-run-promote.js`, 'process.exit(0)\n')
    git(repository, ['add', '-A'])
    git(repository, ['commit', '-m', 'test: add promote workflow'])
    git(repository, ['checkout', '-b', 'review'])
    git(repository, ['checkout', 'development'])
    git(repository, ['checkout', '-b', 'main'])
    git(repository, ['checkout', 'review'])
    const progress: string[] = []

    const result = await makeProductionActioner().run(
      repository,
      'review',
      (step, detail) => progress.push(`${step}:${detail}`),
    )

    expect(result).toMatchObject({
      workflowId: 'promote-production',
      branch: 'main',
      pushed: false,
      verifiedClean: true,
    })
    expect(result.commitSha).toHaveLength(40)
    expect(progress.some((entry) => entry.startsWith('execute:'))).toBe(true)
  })

  it('rejects when the current branch is not review', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)

    await expect(makeProductionActioner().run(
      repository,
      'development',
      () => undefined,
    )).rejects.toThrow('Promote production requires the review branch.')
  })
})
