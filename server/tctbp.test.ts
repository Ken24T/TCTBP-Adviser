import {
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import { inspectTctbp } from './tctbp'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('untrusted TCTBP data inspection', () => {
  it('reports TCTBP as missing without executing repository code', async () => {
    const repository = await temporaryRoot()
    expect(await inspectTctbp(repository)).toMatchObject({
      installed: false,
      compatible: false,
      scaffold: { status: 'unknown' },
    })
  })

  it('accepts a compatible contract and reports missing managed files', async () => {
    const repository = await temporaryRoot()
    await writeJson(repository, '.github/TCTBP.json', {
      schemaVersion: 11,
      project: {
        name: 'fixture-project',
        description: 'Fixture description',
      },
      branchModel: {
        strategy: 'staged',
        workingBranch: 'development',
        stagingBranch: 'staging',
        productionBranch: 'main',
        promoteEnabled: true,
      },
      profile: {
        commands: {
          test: 'npm test',
          lint: null,
          build: 'npm run build',
        },
        qualityGates: {
          requireTestsBeforeShip: true,
          requireLintBeforeShip: false,
          requireBuildBeforeShip: true,
        },
      },
      adviserContract: {
        major: 1,
        minor: 0,
        capabilities: ['inspection.local-v1'],
      },
      adviserVocabulary: {
        workflowIds: ['status', 'checkpoint', 'publish'],
      },
    })
    await writeJson(repository, '.tctbp/source.json', {
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'abc123',
      sourceVersion: '0.2.0',
      managedSurface: ['.github/TCTBP.json', 'scripts/tctbp-*.js'],
    })

    const observation = await inspectTctbp(repository)

    expect(observation).toMatchObject({
      installed: true,
      compatible: true,
      schemaVersion: 11,
      projectName: 'fixture-project',
      projectDescription: 'Fixture description',
      workflows: ['status', 'checkpoint', 'publish'],
      branchModel: {
        strategy: 'staged',
        workingBranch: 'development',
        preProductionBranch: 'staging',
        productionBranch: 'main',
        promotionTargets: ['staging', 'production'],
      },
      scaffold: {
        status: 'incomplete',
        sourceRevision: 'abc123',
        missingManagedPatterns: ['scripts/tctbp-*.js'],
      },
    })
    expect(observation.qualityGates).toEqual(expect.arrayContaining([
      {
        id: 'test',
        configured: true,
        requiredBeforeShip: true,
      },
      {
        id: 'lint',
        configured: false,
        requiredBeforeShip: false,
      },
    ]))
    expect(JSON.stringify(observation)).not.toContain('npm run build')
  })

  it('matches managed file-name wildcards without leaving the directory', async () => {
    const repository = await temporaryRoot()
    await writeJson(repository, '.github/TCTBP.json', compatibleProfile())
    await writeText(repository, 'scripts/tctbp-status.js', '// managed\n')
    await writeJson(repository, '.tctbp/source.json', {
      managedSurface: ['scripts/tctbp-*.js'],
    })

    const observation = await inspectTctbp(repository)

    expect(observation.scaffold).toMatchObject({
      status: 'complete',
      missingManagedPatterns: [],
    })
    expect(observation.errors).toEqual([])
  })

  it('preserves a long-lived review promotion target by name', async () => {
    const repository = await temporaryRoot()
    await writeJson(repository, '.github/TCTBP.json', {
      ...compatibleProfile(),
      branchModel: {
        strategy: 'long-lived',
        workingBranch: 'development',
        reviewBranch: 'review',
        productionBranch: 'main',
        promoteEnabled: true,
      },
    })

    const observation = await inspectTctbp(repository)

    expect(observation.branchModel).toEqual({
      strategy: 'long-lived',
      workingBranch: 'development',
      preProductionBranch: 'review',
      productionBranch: 'main',
      promotionTargets: ['review', 'production'],
    })
  })

  it('resolves branch roles from the strategies map when not at the top level', async () => {
    // The canonical TCTBP-Web repo documents every strategy's roles under
    // branchModel.strategies[<strategy>] without repeating them at the top
    // level. The inspection must resolve the active strategy's roles so a
    // simple canonical repo is understood (production = main) and can ship.
    const repository = await temporaryRoot()
    await writeJson(repository, '.github/TCTBP.json', {
      ...compatibleProfile(),
      branchModel: {
        strategy: 'simple',
        strategies: {
          simple: {
            description: 'Single production branch only.',
            productionBranch: 'main',
            promoteEnabled: false,
          },
          staged: {
            workingBranch: 'development',
            stagingBranch: 'staging',
            productionBranch: 'main',
            promoteEnabled: true,
          },
        },
      },
    })

    const observation = await inspectTctbp(repository)

    expect(observation.branchModel).toEqual({
      strategy: 'simple',
      workingBranch: null,
      preProductionBranch: null,
      productionBranch: 'main',
      promotionTargets: [],
    })
  })

  it('rejects malformed JSON without throwing target content into code', async () => {
    const repository = await temporaryRoot()
    await writeText(
      repository,
      '.github/TCTBP.json',
      '{"__proto__":{"polluted":true},',
    )

    const observation = await inspectTctbp(repository)

    expect(observation.installed).toBe(false)
    expect(observation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'repository-json-invalid' }),
    ]))
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  it('never executes commands embedded in the target profile', async () => {
    const repository = await temporaryRoot()
    const sentinel = path.join(repository, 'executed.txt')
    await writeJson(repository, '.github/TCTBP.json', {
      ...compatibleProfile(),
      profile: {
        commands: {
          test: `node -e "require('fs').writeFileSync('${sentinel}', 'bad')"`,
        },
      },
    })

    const observation = await inspectTctbp(repository)

    expect(observation.compatible).toBe(true)
    await expect(
      import('node:fs/promises').then(({ lstat }) => lstat(sentinel)),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('stops compatibility for an unsupported contract major', async () => {
    const repository = await temporaryRoot()
    await writeJson(repository, '.github/TCTBP.json', {
      schemaVersion: 11,
      project: { name: 'future-project' },
      adviserContract: {
        major: 2,
        minor: 0,
        capabilities: ['inspection.local-v1'],
      },
    })

    const observation = await inspectTctbp(repository)

    expect(observation.compatible).toBe(false)
    expect(observation.errors).toContainEqual({
      code: 'tctbp-contract-incompatible',
      message: 'TCTBP Adviser contract is missing or unsupported.',
    })
  })

  it('rejects unsafe managed-surface traversal', async () => {
    const repository = await temporaryRoot()
    await writeJson(repository, '.github/TCTBP.json', compatibleProfile())
    await writeJson(repository, '.tctbp/source.json', {
      managedSurface: ['../outside.js'],
    })

    const observation = await inspectTctbp(repository)

    expect(observation.scaffold.status).toBe('incomplete')
    expect(observation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'managed-pattern-invalid' }),
    ]))
  })
})

async function temporaryRoot(): Promise<string> {
  const root = await createTemporaryDirectory()
  temporaryDirectories.push(root)
  return root
}

async function writeJson(
  root: string,
  relativePath: string,
  value: unknown,
): Promise<void> {
  await writeText(root, relativePath, `${JSON.stringify(value)}\n`)
}

async function writeText(
  root: string,
  relativePath: string,
  value: string,
): Promise<void> {
  const target = path.join(root, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, value)
}

function compatibleProfile() {
  return {
    schemaVersion: 11,
    project: { name: 'fixture-project' },
    adviserContract: {
      major: 1,
      minor: 0,
      capabilities: ['inspection.local-v1'],
    },
    adviserVocabulary: {
      workflowIds: ['status', 'checkpoint', 'publish', 'resume', 'handover'],
    },
  }
}
