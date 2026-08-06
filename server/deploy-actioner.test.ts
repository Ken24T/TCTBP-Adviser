import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
import { DeployActioner } from './deploy-actioner'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('deploy Actioner', () => {
  it('executes only the fixed development deployment workflow', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)
    await mkdir(`${repository}/scripts`)
    await writeFile(`${repository}/scripts/tctbp-run-deploy.js`, 'process.exit(0)\n')
    git(repository, ['add', '-A'])
    git(repository, ['commit', '-m', 'test: add deploy workflow'])
    const progress: string[] = []

    const result = await new DeployActioner().run(
      repository,
      'development',
      (step, detail) => progress.push(`${step}:${detail}`),
    )

    expect(result).toMatchObject({
      workflowId: 'deploy-development',
      branch: 'development',
      pushed: null,
      remote: null,
      verifiedClean: true,
      summary: 'Development deployment workflow completed; inspect the target result.',
    })
    expect(progress.some((entry) => entry.startsWith('execute:'))).toBe(true)
  })
})
