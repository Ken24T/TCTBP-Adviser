import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
import { RepairActioner } from './repair-actioner'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('TCTBP script compatibility repair', () => {
  it('adds a CommonJS scope for an ESM target without committing', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)
    await writeFile(`${repository}/package.json`, JSON.stringify({ type: 'module' }))
    await mkdir(`${repository}/scripts`)
    git(repository, ['add', '-A'])
    git(repository, ['commit', '-m', 'test: add ESM target'])

    const result = await new RepairActioner().run(repository, 'development', () => undefined)

    expect(result).toMatchObject({
      workflowId: 'repair-tctbp-script-compatibility',
      pushed: false,
      verifiedClean: false,
    })
  })
})
