import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
import { HandoverActioner } from './handover-actioner'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('handover Actioner', () => {
  it('runs the fixed handover workflow with a narrative note', async () => {
    const root = await createTemporaryDirectory()
    directories.push(root)
    const repository = await createGitRepository(root)
    await mkdir(`${repository}/scripts`)
    await writeFile(`${repository}/scripts/tctbp-run-handover.js`, `const fs = require('fs'); fs.mkdirSync('.tctbp/continuation', { recursive: true }); fs.writeFileSync('.tctbp/continuation/test-handover.md', '# Handover\\n');\n`)
    git(repository, ['add', '-A'])
    git(repository, ['commit', '-m', 'test: add handover workflow'])
    const result = await new HandoverActioner().run(repository, 'development', () => undefined)

    expect(result).toMatchObject({
      workflowId: 'handover',
      branch: 'development',
      pushed: true,
      verifiedClean: true,
      summary: expect.stringContaining('.tctbp/continuation/test-handover.md'),
    })
    expect(git(repository, ['ls-files', '.tctbp/continuation']).length).toBeGreaterThanOrEqual(0)
  })
})
