import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
import { ResumeActioner } from './resume-actioner'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('resume Actioner', () => {
  it('runs the fixed resume workflow without switching branches', async () => {
    const root = await createTemporaryDirectory()
    directories.push(root)
    const repository = await createGitRepository(root)
    await mkdir(`${repository}/scripts`)
    await writeFile(`${repository}/scripts/tctbp-run-resume.js`, 'process.exit(0)\n')
    git(repository, ['add', '-A'])
    git(repository, ['commit', '-m', 'test: add resume workflow'])

    const result = await new ResumeActioner().run(repository, 'development', () => undefined)

    expect(result).toMatchObject({
      workflowId: 'resume',
      branch: 'development',
      pushed: false,
      verifiedClean: true,
    })
    expect(git(repository, ['branch', '--show-current'])).toBe('development')
  })
})
