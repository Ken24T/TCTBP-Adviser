import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
import { ShipActioner } from './ship-actioner'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('ship Actioner', () => {
  it('executes the TCTBP ship workflow and reports the result', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)
    await mkdir(`${repository}/scripts`)
    await writeFile(`${repository}/scripts/tctbp-run-ship.js`, 'process.exit(0)\n')
    git(repository, ['add', '-A'])
    git(repository, ['commit', '-m', 'test: add ship workflow'])
    git(repository, ['checkout', '-b', 'main'])
    const progress: string[] = []

    const result = await new ShipActioner().run(
      repository,
      'main',
      (step, detail) => progress.push(`${step}:${detail}`),
    )

    expect(result).toMatchObject({
      workflowId: 'ship',
      branch: 'main',
      pushed: false,
      verifiedClean: true,
    })
    expect(result.commitSha).toHaveLength(40)
    expect(progress.some((entry) => entry.startsWith('execute:'))).toBe(true)
  })

  it('rejects when the current branch is not main', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)

    await expect(new ShipActioner().run(
      repository,
      'review',
      () => undefined,
    )).rejects.toThrow('Ship requires the main branch.')
  })

  it('uses a custom production branch when provided', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)
    await mkdir(`${repository}/scripts`)
    await writeFile(`${repository}/scripts/tctbp-run-ship.js`, 'process.exit(0)\n')
    git(repository, ['add', '-A'])
    git(repository, ['commit', '-m', 'test: add ship workflow'])
    git(repository, ['checkout', '-b', 'master'])

    const result = await new ShipActioner('master').run(
      repository,
      'master',
      () => undefined,
    )

    expect(result).toMatchObject({
      workflowId: 'ship',
      branch: 'master',
    })
    await expect(new ShipActioner('master').run(
      repository,
      'main',
      () => undefined,
    )).rejects.toThrow('Ship requires the master branch.')
  })
})
