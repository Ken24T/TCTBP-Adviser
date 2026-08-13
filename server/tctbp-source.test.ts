import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGitRepository, createTemporaryDirectory, git } from '../test/helpers'
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
  it('bootstraps a temporary target on a dedicated branch without committing', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const canonicalPackageJson = '{\n  "type": "commonjs",\n  "description": "Canonical CommonJS pin for TCTBP runner scripts."\n}\n'
    const source = path.join(root, 'TCTBP-Web')
    const target = await createGitRepository(root, 'target')
    await mkdir(path.join(source, 'scripts'), { recursive: true })
    await mkdir(path.join(source, '.github'), { recursive: true })
    await mkdir(path.join(source, 'schemas'), { recursive: true })
    await writeFile(
      path.join(source, 'scripts', 'tctbp-run-scaffold.js'),
      [
        'const RUNNER_FILES = ["tctbp-core.js", "package.json"];',
        'const GITHUB_FILES = [];',
        'const PROMPT_FILES = [];',
        'const CONTRACT_FILES = ["schemas/contract.json"];',
      ].join('\n'),
    )
    await writeFile(path.join(source, 'VERSION'), '{"version":"0.3.0"}\n')
    await writeFile(
      path.join(source, 'scripts', 'package.json'),
      canonicalPackageJson,
    )
    await writeFile(
      path.join(source, '.github', 'TCTBP.json'),
      JSON.stringify({
        schemaVersion: 11,
        project: { name: 'canonical' },
        profile: { commands: {}, qualityGates: {} },
      }),
    )
    await writeFile(path.join(source, 'scripts', 'tctbp-core.js'), '// core\\n')
    await writeFile(path.join(source, 'schemas', 'contract.json'), '{}\\n')

    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: null,
      sourceRevision: null,
      sourceVersion: null,
    }, 'main', [], false)
    const plan = await service.bootstrapPlan(observation, {
      projectName: 'target',
      projectDescription: 'A test target.',
      branchStrategy: 'simple',
      workingBranch: 'development',
      preProductionBranch: null,
      productionBranch: 'main',
      testCommand: 'npm run test',
      buildCommand: 'npm run build',
      deployEnabled: false,
      includeHookLayer: true,
    })
    const result = await service.bootstrapApply(target, observation, {
      confirm: true,
      aiReviewId: 'test-review',
      aiReviewAcknowledged: true,
      planFingerprint: plan.fingerprint ?? '',
      request: plan.request!,
    })

    expect(result).toMatchObject({
      status: 'applied',
      branch: 'upgrade/tctbp-bootstrap-aaaaaaa',
      committed: false,
      pushed: false,
    })
    expect(git(target, ['branch', '--show-current'])).toBe('upgrade/tctbp-bootstrap-aaaaaaa')
    await expect(readFile(path.join(target, '.github', 'TCTBP.json'), 'utf8'))
      .resolves.toContain('"name": "target"')
    await expect(readFile(path.join(target, 'scripts', 'package.json'), 'utf8'))
      .resolves.toBe(canonicalPackageJson)
    await expect(readFile(path.join(target, '.tctbp', 'source.json'), 'utf8'))
      .resolves.toContain('Ken24T/TCTBP-Web')
  })

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
        candidateGuard: { enabled: true },
        project: { name: 'canonical' },
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
        candidateGuard: { enabled: true },
        project: { name: 'canonical' },
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
      // Not on an environment branch, so no dedicated upgrade branch is needed.
      upgradeBranch: null,
    })
    expect(plan.drift.counts).toEqual({
      current: 1,
      'missing-target': 1,
      drifted: 1,
      'source-unavailable': 0,
    })
  })

  it('plans drift when the managed surface lives in the dedicated manifest module', async () => {
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
    // Newer TCTBP-Web layout: the arrays live in the shared manifest module
    // and the scaffold runner only requires them (no inline arrays).
    await writeFile(
      path.join(source, 'scripts', 'tctbp-managed-surface.js'),
      [
        'const RUNNER_FILES = ["tctbp-core.js"];',
        'const GITHUB_FILES = ["TCTBP Agent.md"];',
        'const PROMPT_FILES = [];',
        'const CONTRACT_FILES = ["schemas/contract.json"];',
      ].join('\n'),
    )
    await writeFile(
      path.join(source, 'scripts', 'tctbp-run-scaffold.js'),
      'const { RUNNER_FILES, GITHUB_FILES } = require("./tctbp-managed-surface");\n',
    )
    await writeFile(path.join(source, 'VERSION'), '{"version":"0.3.6"}\n')
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

    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: revision,
      sourceVersion: '0.3.6',
    })
    const plan = await service.plan(target, observation)

    expect(plan.disposition).toBe('review-required')
    expect(plan.source).toMatchObject({
      state: 'available',
      version: '0.3.6',
      managedFileCount: 3,
    })
    expect(plan.policy).toEqual({ state: 'aligned', differences: [] })
    expect(plan.drift.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'scripts/tctbp-core.js', state: 'current' }),
      expect.objectContaining({ path: '.github/TCTBP Agent.md', state: 'drifted' }),
      expect.objectContaining({ path: 'schemas/contract.json', state: 'missing-target' }),
    ]))
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
      aiReviewId: 'test-review',
      aiReviewAcknowledged: true,
      planFingerprint: plan.fingerprint ?? '',
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
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

  it('auto-creates a dedicated upgrade branch when applying on an environment branch', async () => {
    const { source, target } = await fixtureRepositories()
    // The fixture target is a plain directory; the upgrade-branch apply runs
    // real git switch commands, so make it a repository first.
    git(target, ['init', '-b', 'development'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])
    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'old'.repeat(10),
      sourceVersion: '0.2.0',
    }, 'development', [], true)
    const plan = await service.plan(target, observation)
    expect(plan.target.upgradeBranch).toBe('upgrade/tctbp-0.3.0-aaaaaaa')
    expect(plan.disposition).toBe('review-required')
    // No hard blocker: the apply step resolves the environment branch itself.
    expect(plan.blockers).toEqual([])

    const result = await service.apply(target, observation, {
      confirm: true,
      aiReviewId: 'test-review',
      aiReviewAcknowledged: true,
      planFingerprint: plan.fingerprint ?? '',
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    })

    expect(result).toMatchObject({
      status: 'applied',
      branch: 'upgrade/tctbp-0.3.0-aaaaaaa',
      branchCreated: true,
      committed: false,
      pushed: false,
    })
    expect(git(target, ['branch', '--show-current']))
      .toBe('upgrade/tctbp-0.3.0-aaaaaaa')
    await expect(readFile(path.join(target, 'schemas', 'contract.json'), 'utf8'))
      .resolves.toBe('{}\n')
  })

  it('reuses an existing upgrade branch instead of creating a second one', async () => {
    const { source, target } = await fixtureRepositories()
    git(target, ['init', '-b', 'development'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])
    const upgradeBranch = 'upgrade/tctbp-0.3.0-aaaaaaa'
    git(target, ['switch', '-c', upgradeBranch])
    git(target, ['switch', 'development'])
    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'old'.repeat(10),
      sourceVersion: '0.2.0',
    }, 'development', [], true)
    const plan = await service.plan(target, observation)

    const result = await service.apply(target, observation, {
      confirm: true,
      aiReviewId: 'test-review',
      aiReviewAcknowledged: true,
      planFingerprint: plan.fingerprint ?? '',
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    })

    expect(result).toMatchObject({
      status: 'applied',
      branch: upgradeBranch,
      branchCreated: false,
      committed: false,
      pushed: false,
    })
    expect(git(target, ['branch', '--show-current'])).toBe(upgradeBranch)
  })

  it('offers cleanup once the upgrade branch is merged back and verified', async () => {
    const { source, target } = await fixtureRepositories()
    const upgradeBranch = 'upgrade/tctbp-0.3.0-aaaaaaa'
    git(target, ['init', '-b', 'development'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])
    git(target, ['switch', '-c', upgradeBranch])
    git(target, ['switch', 'development'])
    git(target, ['merge', '--no-ff', upgradeBranch, '-m', `chore: merge ${upgradeBranch}`])

    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: revision,
      sourceVersion: '0.3.0',
    }, 'development', [], true)
    const plan = await service.plan(target, observation)

    expect(plan.cleanup).toEqual({
      branch: upgradeBranch,
      available: true,
      reason: null,
    })
  })

  it('withholds cleanup while on the upgrade branch, until merged, or when dirty', async () => {
    const { source, target } = await fixtureRepositories()
    const upgradeBranch = 'upgrade/tctbp-0.3.0-aaaaaaa'
    git(target, ['init', '-b', 'development'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])

    const service = new CanonicalTctbpSourceService(source, executor())
    const scaffold = {
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: revision,
      sourceVersion: '0.3.0',
    }

    // On the upgrade branch: refuse.
    git(target, ['switch', '-c', upgradeBranch])
    let observation = targetObservation(scaffold, upgradeBranch, [], true)
    let plan = await service.plan(target, observation)
    expect(plan.cleanup).toMatchObject({
      branch: upgradeBranch,
      available: false,
    })
    expect(plan.cleanup?.reason).toMatch(/currently on/)

    // Created with a unique commit but not merged back: refuse.
    await writeFile(path.join(target, 'upgrade.txt'), 'upgrade\n')
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: upgrade change'])
    git(target, ['switch', 'development'])
    observation = targetObservation(scaffold, 'development', [], true)
    plan = await service.plan(target, observation)
    expect(plan.cleanup).toMatchObject({ available: false })
    expect(plan.cleanup?.reason).toMatch(/not been merged/)

    // Merged back but the working tree is dirty: refuse.
    git(target, ['merge', '--no-ff', upgradeBranch, '-m', `chore: merge ${upgradeBranch}`])
    await writeFile(path.join(target, 'untracked.txt'), 'dirty\n')
    observation = targetObservation(scaffold, 'development', [], true)
    observation = {
      ...observation,
      workingTree: { ...observation.workingTree, clean: false },
    }
    plan = await service.plan(target, observation)
    expect(plan.cleanup).toMatchObject({ available: false })
    expect(plan.cleanup?.reason).toMatch(/not clean/)
  })

  it('removes a merged upgrade branch locally and on origin', async () => {
    const { source, target } = await fixtureRepositories()
    const upgradeBranch = 'upgrade/tctbp-0.3.0-aaaaaaa'
    git(target, ['init', '-b', 'development'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])
    git(target, ['switch', '-c', upgradeBranch])
    git(target, ['switch', 'development'])
    git(target, ['merge', '--no-ff', upgradeBranch, '-m', `chore: merge ${upgradeBranch}`])
    const remote = await createTemporaryDirectory()
    temporaryDirectories.push(remote)
    git(remote, ['init', '--bare'])
    git(target, ['remote', 'add', 'origin', remote])
    git(target, ['push', '-u', 'origin', 'development'])
    git(target, ['push', '-u', 'origin', upgradeBranch])

    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: revision,
      sourceVersion: '0.3.0',
    }, 'development', [], true)

    const result = await service.cleanupUpgradeBranch(target, observation)

    expect(result).toEqual({
      status: 'cleaned',
      branch: upgradeBranch,
      localDeleted: true,
      remoteDeleted: true,
      committed: false,
      pushed: false,
    })
    expect(git(target, ['branch', '--list', upgradeBranch])).toBe('')
    expect(git(remote, ['show-ref'])).not.toContain(upgradeBranch)
  })

  it('refuses cleanup while the upgrade branch is not merged', async () => {
    const { source, target } = await fixtureRepositories()
    const upgradeBranch = 'upgrade/tctbp-0.3.0-aaaaaaa'
    git(target, ['init', '-b', 'development'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])
    git(target, ['switch', '-c', upgradeBranch])
    await writeFile(path.join(target, 'upgrade.txt'), 'upgrade\n')
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: upgrade change'])
    git(target, ['switch', 'development'])

    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: revision,
      sourceVersion: '0.3.0',
    }, 'development', [], true)

    await expect(service.cleanupUpgradeBranch(target, observation))
      .rejects.toMatchObject({ code: 'upgrade-cleanup-blocked' })
    // The branch must still exist.
    expect(git(target, ['branch', '--list', upgradeBranch])).toBe(upgradeBranch)
  })

  it('merges a published upgrade branch back into the working branch and pushes', async () => {
    const { source, target } = await fixtureRepositories()
    const upgradeBranch = 'upgrade/tctbp-0.3.0-aaaaaaa'
    git(target, ['init', '-b', 'development'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])
    git(target, ['switch', '-c', upgradeBranch])
    await writeFile(path.join(target, 'upgrade.txt'), 'upgrade\n')
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: upgrade change'])
    const remote = await createTemporaryDirectory()
    temporaryDirectories.push(remote)
    git(remote, ['init', '--bare'])
    git(target, ['remote', 'add', 'origin', remote])
    git(target, ['push', '-u', 'origin', 'development'])
    git(target, ['push', '-u', 'origin', upgradeBranch])

    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: revision,
      sourceVersion: '0.3.0',
    }, upgradeBranch, [], true)

    const result = await service.mergeUpgradeBranch(target, observation)

    expect(result).toEqual({
      status: 'merged',
      branch: upgradeBranch,
      destinationBranch: 'development',
      merged: true,
      pushed: true,
      committed: false,
    })
    expect(git(target, ['branch', '--show-current'])).toBe('development')
    expect(git(remote, ['rev-parse', 'refs/heads/development']).trim())
      .toBe(git(target, ['rev-parse', 'development']).trim())
  })

  it('merges into the production branch for a simple branch model', async () => {
    const { source, target } = await fixtureRepositories()
    const upgradeBranch = 'upgrade/tctbp-0.3.0-aaaaaaa'
    git(target, ['init', '-b', 'main'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])
    git(target, ['switch', '-c', upgradeBranch])
    await writeFile(path.join(target, 'upgrade.txt'), 'upgrade\n')
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: upgrade change'])
    const remote = await createTemporaryDirectory()
    temporaryDirectories.push(remote)
    git(remote, ['init', '--bare'])
    git(target, ['remote', 'add', 'origin', remote])
    git(target, ['push', '-u', 'origin', 'main'])
    git(target, ['push', '-u', 'origin', upgradeBranch])

    const base = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: revision,
      sourceVersion: '0.3.0',
    }, upgradeBranch, [], true)
    const observation = {
      ...base,
      tctbp: {
        ...base.tctbp,
        branchModel: {
          workingBranch: null,
          preProductionBranch: null,
          productionBranch: 'main',
        },
      },
    }

    const service = new CanonicalTctbpSourceService(source, executor())
    const result = await service.mergeUpgradeBranch(target, observation)

    expect(result.destinationBranch).toBe('main')
    expect(git(target, ['branch', '--show-current'])).toBe('main')
  })

  it('refuses to merge when the branches have diverged', async () => {
    const { source, target } = await fixtureRepositories()
    const upgradeBranch = 'upgrade/tctbp-0.3.0-aaaaaaa'
    git(target, ['init', '-b', 'development'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])
    git(target, ['switch', '-c', upgradeBranch])
    await writeFile(path.join(target, 'upgrade.txt'), 'upgrade\n')
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: upgrade change'])
    // Divergence: the working branch moves on without the upgrade branch.
    git(target, ['switch', 'development'])
    await writeFile(path.join(target, 'mainline.txt'), 'mainline\n')
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: mainline change'])
    git(target, ['switch', upgradeBranch])

    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: revision,
      sourceVersion: '0.3.0',
    }, upgradeBranch, [], true)

    await expect(service.mergeUpgradeBranch(target, observation))
      .rejects.toMatchObject({ code: 'upgrade-merge-blocked' })
  })

  it('refuses to merge while the working tree is dirty', async () => {
    const { source, target } = await fixtureRepositories()
    const upgradeBranch = 'upgrade/tctbp-0.3.0-aaaaaaa'
    git(target, ['init', '-b', 'development'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])
    git(target, ['switch', '-c', upgradeBranch])

    const scaffold = {
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: revision,
      sourceVersion: '0.3.0',
    }
    const observation = {
      ...targetObservation(scaffold, upgradeBranch, [], true),
      workingTree: {
        ...targetObservation(scaffold, upgradeBranch, [], true).workingTree,
        clean: false,
      },
    }

    const service = new CanonicalTctbpSourceService(source, executor())
    await expect(service.mergeUpgradeBranch(target, observation))
      .rejects.toMatchObject({ code: 'upgrade-merge-blocked' })
  })

  it('refuses to merge when there is no upgrade branch', async () => {
    const { source, target } = await fixtureRepositories()
    git(target, ['init', '-b', 'development'])
    git(target, ['config', 'user.name', 'TCTBP Test'])
    git(target, ['config', 'user.email', 'test@example.invalid'])
    git(target, ['add', '.'])
    git(target, ['commit', '-m', 'test: base'])

    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: revision,
      sourceVersion: '0.3.0',
    }, 'development', [], true)

    await expect(service.mergeUpgradeBranch(target, observation))
      .rejects.toMatchObject({ code: 'upgrade-merge-unavailable' })
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
      aiReviewId: 'test-review',
      aiReviewAcknowledged: true,
      planFingerprint: 'b'.repeat(64),
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    })).rejects.toMatchObject({ code: 'upgrade-plan-stale' })
    await expect(readFile(path.join(target, 'schemas', 'contract.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect(plan.fingerprint).not.toBe('b'.repeat(64))
  })

  it('applies multiple in-order steps in a single request against one plan', async () => {
    // The "Apply in order (N steps)" button sends all applicable steps as an
    // ordered list in ONE request, so the whole reviewed plan is applied
    // against a single fingerprint without any intermediate re-plan.
    const { source, target } = await fixtureRepositories()
    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'old'.repeat(10),
      sourceVersion: '0.2.0',
    })
    const plan = await service.plan(target, observation)
    const driftedPaths = plan.drift.files
      .filter((file) => file.state === 'drifted')
      .map((file) => file.path)
    const request: TctbpApplyRequest = {
      confirm: true,
      aiReviewId: 'test-review',
      aiReviewAcknowledged: true,
      planFingerprint: plan.fingerprint ?? '',
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
      steps: [
        {
          mode: 'additions-only',
          approvedPaths: [],
          approvedDeletionPaths: [],
          confirmDeletions: false,
        },
        {
          mode: 'approved-managed-files',
          approvedPaths: driftedPaths,
          approvedDeletionPaths: [],
          confirmDeletions: false,
        },
      ],
    }

    const result = await service.apply(target, observation, request)

    expect(result.status).toBe('applied')
    expect(result.appliedPaths).toEqual(expect.arrayContaining([
      'schemas/contract.json',
      '.github/TCTBP Agent.md',
    ]))
    await expect(readFile(path.join(target, 'schemas', 'contract.json'), 'utf8'))
      .resolves.toBe('{}\n')
    await expect(readFile(path.join(target, '.github', 'TCTBP Agent.md'), 'utf8'))
      .resolves.toBe('source\n')
  })

  it('merges canonical policy sections while preserving project fields', async () => {
    const { source, target } = await fixtureRepositories()
    await writeFile(
      path.join(source, '.github', 'TCTBP.json'),
      JSON.stringify({
        schemaVersion: 11,
        adviserContract: { major: 1, minor: 0, capabilities: ['inspection.local-v1'] },
        adviserVocabulary: { workflowIds: ['status'] },
        candidateGuard: { enabled: true },
        project: { name: 'canonical-name' },
      }),
    )
    await writeFile(
      path.join(target, '.github', 'TCTBP.json'),
      JSON.stringify({
        schemaVersion: 11,
        adviserContract: { major: 1, minor: 0, capabilities: ['inspection.local-v1'] },
        adviserVocabulary: { workflowIds: ['status'] },
        candidateGuard: { enabled: false },
        project: { name: 'target-name' },
      }),
    )
    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'old'.repeat(10),
      sourceVersion: '0.2.0',
    })
    const plan = await service.plan(target, observation)

    await service.apply(target, observation, {
      confirm: true,
      aiReviewId: 'test-review',
      aiReviewAcknowledged: true,
      planFingerprint: plan.fingerprint ?? '',
      mode: 'approved-managed-files',
      approvedPaths: ['.github/TCTBP.json'],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    })

    const merged = JSON.parse(
      await readFile(path.join(target, '.github', 'TCTBP.json'), 'utf8'),
    ) as { candidateGuard: { enabled: boolean }; project: { name: string } }
    expect(merged.candidateGuard.enabled).toBe(true)
    expect(merged.project.name).toBe('target-name')
  })

  it('deletes only explicitly approved obsolete managed files', async () => {
    const { source, target } = await fixtureRepositories()
    await mkdir(path.join(target, '.tctbp'), { recursive: true })
    await writeFile(path.join(target, 'scripts', 'tctbp-old.js'), 'old\n')
    await writeFile(
      path.join(target, '.tctbp', 'source.json'),
      JSON.stringify({ managedSurface: ['scripts/tctbp-*.js'] }),
    )
    const service = new CanonicalTctbpSourceService(source, executor())
    const observation = targetObservation(
      {
        sourceRepository: 'Ken24T/TCTBP-Web',
        sourceRevision: 'old'.repeat(10),
        sourceVersion: '0.2.0',
      },
      'feature/tctbp-upgrade',
      ['scripts/tctbp-*.js'],
    )
    const plan = await service.plan(target, observation)

    expect(plan.drift.obsoleteTargets).toEqual([
      {
        path: 'scripts/tctbp-old.js',
        targetHash: expect.any(String),
      },
    ])
    await service.apply(target, observation, {
      confirm: true,
      aiReviewId: 'test-review',
      aiReviewAcknowledged: true,
      planFingerprint: plan.fingerprint ?? '',
      mode: 'approved-managed-files',
      approvedPaths: [],
      approvedDeletionPaths: ['scripts/tctbp-old.js'],
      confirmDeletions: true,
    })
    await expect(readFile(path.join(target, 'scripts', 'tctbp-old.js'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('classifies a non-TCTBP target as bootstrap-required', async () => {
    const { source, target } = await fixtureRepositories()
    const plan = await new CanonicalTctbpSourceService(source, executor()).plan(
      target,
      targetObservation({
        sourceRepository: null,
        sourceRevision: null,
        sourceVersion: null,
      }, 'main', [], false),
    )

    expect(plan.disposition).toBe('bootstrap-required')
    expect(plan.bootstrap).toMatchObject({
      applyAllowed: false,
      managedFileCount: 3,
      requiredInputs: expect.arrayContaining(['Project name and description']),
    })
    // Being on an environment branch is no longer a blocker; the plan instead
    // carries the dedicated upgrade branch the apply step would use.
    expect(plan.blockers).toEqual([])
    expect(plan.target.upgradeBranch).toBe('upgrade/tctbp-0.3.0-aaaaaaa')
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
  managedSurface: string[] = [],
  installed = true,
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
      installed,
      branchModel: {
        workingBranch: 'development',
        preProductionBranch: 'review',
        productionBranch: 'main',
      },
      scaffold: { ...scaffold, managedSurface },
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
