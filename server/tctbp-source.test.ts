import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import type { GitExecutor } from './git-command'
import { CanonicalTctbpSourceService } from './tctbp-source'

const temporaryDirectories: string[] = []
const revision = 'a'.repeat(40)

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('canonical TCTBP-Web source planning', () => {
  it('plans managed-file drift against a configured canonical checkout', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const source = path.join(root, 'TCTBP-Web')
    const target = path.join(root, 'target')
    await Promise.all([
      mkdir(path.join(source, 'scripts'), { recursive: true }),
      mkdir(path.join(source, '.github'), { recursive: true }),
      mkdir(path.join(source, 'schemas'), { recursive: true }),
      mkdir(path.join(target, 'scripts'), { recursive: true }),
      mkdir(path.join(target, '.github'), { recursive: true }),
    ])
    await writeFile(
      path.join(source, 'scripts', 'tctbp-run-scaffold.js'),
      [
        'const RUNNER_FILES = ["tctbp-core.js"];',
        'const GITHUB_FILES = ["TCTBP Agent.md"];',
        'const PROMPT_FILES = [];',
        'const CONTRACT_FILES = ["schemas/contract.json"];',
      ].join('\n'),
    )
    await writeFile(path.join(source, 'VERSION'), '{"version":"0.3.0"}\n')
    await writeFile(path.join(source, 'scripts', 'tctbp-core.js'), 'same\n')
    await writeFile(path.join(source, '.github', 'TCTBP Agent.md'), 'source\n')
    await writeFile(path.join(source, 'schemas', 'contract.json'), '{}\n')
    await writeFile(path.join(target, 'scripts', 'tctbp-core.js'), 'same\n')
    await writeFile(path.join(target, '.github', 'TCTBP Agent.md'), 'target\n')

    const plan = await new CanonicalTctbpSourceService(
      source,
      executor(),
    ).plan(target, {
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'old'.repeat(10),
      sourceVersion: '0.2.0',
    })

    expect(plan.source).toMatchObject({
      state: 'available',
      repository: 'TCTBP-Web',
      revision,
      version: '0.3.0',
      managedFileCount: 3,
    })
    expect(plan.target).toEqual({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'old'.repeat(10),
      sourceVersion: '0.2.0',
    })
    expect(plan.drift.counts).toEqual({
      current: 1,
      'missing-target': 1,
      drifted: 1,
      'source-unavailable': 0,
    })
  })

  it('returns a non-mutating unavailable plan without a source checkout', async () => {
    const plan = await new CanonicalTctbpSourceService(null, executor()).plan(
      '/target',
      {
        sourceRepository: null,
        sourceRevision: null,
        sourceVersion: null,
      },
    )

    expect(plan.source).toMatchObject({
      state: 'not-configured',
      managedFileCount: 0,
    })
    expect(plan.drift.files).toEqual([])
  })
})

function executor(): GitExecutor {
  return {
    async run(_repositoryPath, command) {
      if (command.id !== 'head') {
        throw new Error(`Unexpected command: ${command.id}`)
      }
      return { stdout: `${revision}\n`, stderr: '' }
    },
  }
}
