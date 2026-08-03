import { afterEach, describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
import { CheckpointActioner } from './checkpoint-actioner'
import { mkdir, writeFile } from 'node:fs/promises'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('checkpoint Actioner', () => {
  it('creates a local checkpoint and verifies the clean result', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root)
    await mkdir(`${repository}/notes`, { recursive: true })
    await writeFile(`${repository}/notes/change.md`, 'new work\n')
    const progress: string[] = []

    const result = await new CheckpointActioner().run(
      repository,
      'development',
      (step, detail) => progress.push(`${step}:${detail}`),
    )

    expect(result).toMatchObject({
      workflowId: 'checkpoint',
      branch: 'development',
      pushed: false,
      remote: null,
      verifiedClean: true,
    })
    expect(git(repository, ['log', '-1', '--format=%s']))
      .toBe('checkpoint: preserve local working state')
    expect(progress.some((entry) => entry.startsWith('complete:'))).toBe(true)
  })
})
