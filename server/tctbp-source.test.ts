import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import type { TctbpApplyRequest } from '../shared/tctbp-upgrade'
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
    await writeFile(
      path.join(source, '.github', 'TCTBP.json'),
      JSON.stringify({
        schemaVersion: 11,
        adviserContract: { major: 1, minor: 0, capabilities: ['inspection.local-v1'] },
        adviserVocabulary: { workflowIds: ['status'] },
      }),
    )
    await writeFile(path.join(source, 'scripts', 'tctbp-core.js'), 'same\n')
    await writeFile(path.join(source, '.github', 'TCTBP Agent.md'), 'source\n')
    await writeFile(path.join(source, 'schemas', 'contract.json'), '{}\n')
    await writeFile(path.join(target, 'scripts', 'tctbp-core.js'), 'same\n')
    await writeFile(path.join(target, '.github', 'TCTBP Agent.md'), 'target\n')
    await writeFile(
      path.join(target, '.github', 'TCTBP.json'),
      JSON.stringify({
        schemaVersion: 11,
        adviserContract: { major: 1, minor: 0, capabilities: ['inspection.local-v1'] },
        adviserVocabulary: { workflowIds: ['status'] },
      }),
    )

    const plan = await new CanonicalTctbpSourceService(
      source,
      executor(),
    ).plan(target, targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'old'.repeat(10),
      sourceVersion: '0.2.0',
    }))

    expect(plan.disposition).toBe('review-required')
    expect(plan.sourceAlignment).toBe('outdated')
    expect(plan.actionCounts).toEqual({
      preserve: 1,
      add: 1,
      review: 1,
      unavailable: 0,
    })
    expect(plan.blockers).toEqual([])
    expect(plan.policy).toEqual({ state: 'aligned', differences: [] })
    expect(plan.source).toMatchObject({
      state: 'available',
      repository: 'TCTBP-Web',
      revision,
      version: '0.3.0',
      managedFileCount: 3,
    })
    expect(plan.target).toEqual({
      branch: 'feature/tctbp-upgrade',
      headSha: revision,
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

  it('applies approved additions only on a dedicated branch', async () => {
    const { source, target } = await fixtureRepositories()
    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'old'.repeat(10),
      sourceVersion: '0.2.0',
    })
    const plan = await service.plan(target, observation)
    const request: TctbpApplyRequest = {
      confirm: true,
      planFingerprint: plan.fingerprint ?? '',
      mode: 'additions-only',
      approvedPaths: [],
    }

    const result = await service.apply(target, observation, request)

    expect(result).toMatchObject({
      status: 'applied',
      committed: false,
      pushed: false,
    })
    await expect(readFile(path.join(target, 'schemas', 'contract.json'), 'utf8'))
      .resolves.toBe('{}\n')
    await expect(readFile(path.join(target, 'scripts', 'tctbp-core.js'), 'utf8'))
      .resolves.toBe('same\n')
  })

  it('rejects a stale apply plan without changing the target', async () => {
    const { source, target } = await fixtureRepositories()
    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'old'.repeat(10),
      sourceVersion: '0.2.0',
    })
    const plan = await service.plan(target, observation)

    await expect(service.apply(target, observation, {
      confirm: true,
      planFingerprint: 'b'.repeat(64),
      mode: 'additions-only',
      approvedPaths: [],
    })).rejects.toMatchObject({ code: 'upgrade-plan-stale' })
    await expect(readFile(path.join(target, 'schemas', 'contract.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect(plan.fingerprint).not.toBe('b'.repeat(64))
  })

  it('returns a non-mutating unavailable plan without a source checkout', async () => {
    const plan = await new CanonicalTctbpSourceService(null, executor()).plan(
      '/target',
      targetObservation({
        sourceRepository: null,
        sourceRevision: null,
        sourceVersion: null,
      }),
    )

    expect(plan.disposition).toBe('source-unavailable')
    expect(plan.sourceAlignment).toBe('unknown')
    expect(plan.actionCounts).toEqual({
      preserve: 0,
      add: 0,
      review: 0,
      unavailable: 0,
    })
    expect(plan.blockers).toEqual([
      {
        code: 'source-unavailable',
        message: 'A canonical TCTBP-Web checkout is not configured.',
      },
      {
        code: 'policy-unavailable',
        message: 'Canonical or target TCTBP policy could not be compared.',
      },
    ])
    expect(plan.source).toMatchObject({
      state: 'not-configured',
      managedFileCount: 0,
    })
    expect(plan.drift.files).toEqual([])
  })
})

async function fixtureRepositories(): Promise<{
  source: string
  target: string
}> {
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
  await writeFile(
    path.join(source, '.github', 'TCTBP.json'),
    JSON.stringify({
      schemaVersion: 11,
      adviserContract: { major: 1, minor: 0, capabilities: ['inspection.local-v1'] },
      adviserVocabulary: { workflowIds: ['status'] },
    }),
  )
  await writeFile(path.join(source, 'scripts', 'tctbp-core.js'), 'same\n')
  await writeFile(path.join(source, '.github', 'TCTBP Agent.md'), 'source\n')
  await writeFile(path.join(source, 'schemas', 'contract.json'), '{}\n')
  await writeFile(path.join(target, 'scripts', 'tctbp-core.js'), 'same\n')
  await writeFile(path.join(target, '.github', 'TCTBP Agent.md'), 'target\n')
  await writeFile(
    path.join(target, '.github', 'TCTBP.json'),
    JSON.stringify({
      schemaVersion: 11,
      adviserContract: { major: 1, minor: 0, capabilities: ['inspection.local-v1'] },
      adviserVocabulary: { workflowIds: ['status'] },
    }),
  )
  return { source, target }
}

function targetObservation(
  scaffold: {
    sourceRepository: string | null
    sourceRevision: string | null
    sourceVersion: string | null
  },
  branch = 'feature/tctbp-upgrade',
) {
  return {
    head: { branch, detached: false, unborn: false, sha: revision },
    operations: [],
    workingTree: {
      clean: true,
      pathCount: 0,
      counts: {
        staged: 0,
        modified: 0,
        untracked: 0,
        conflicted: 0,
      },
    },
    tctbp: {
      branchModel: {
        workingBranch: 'development',
        preProductionBranch: 'review',
        productionBranch: 'main',
      },
      scaffold,
    },
  }
}

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
