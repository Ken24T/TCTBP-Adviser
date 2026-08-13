import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runStatusVerify } from './status-verify'
import { createTemporaryDirectory } from '../test/helpers'

const DOCUMENT = {
  contract: {
    name: 'TCTBP Adviser',
    major: 1,
    minor: 0,
    capabilities: ['inspection-v1'],
    schema: 'schemas/tctbp-adviser-inspection-v1.schema.json',
  },
  observation: {
    provider: 'tctbp-web',
    observedAt: '2026-08-13T00:00:00.000Z',
    fetchPerformed: false,
    repository: {
      name: 'fixture',
      tctbpSchemaVersion: 11,
      tctbpVersion: '0.3.6',
      versionSource: 'scripts/package.json',
    },
    head: { branch: 'development', detached: false, sha: 'a'.repeat(40) },
    workingTree: { clean: true, pathCount: 0 },
    operations: [],
    release: { reachableTag: 'v0.3.6', publishedTag: 'v0.3.6' },
    continuationFileCount: 0,
    statusAdvice: { tokens: [], reasonCodes: [] },
    activeGuardrails: [],
  },
  errors: [],
}

async function repositoryWithRunner(script: string): Promise<string> {
  const directory = await createTemporaryDirectory()
  await mkdir(path.join(directory, 'scripts'), { recursive: true })
  await writeFile(
    path.join(directory, 'scripts', 'tctbp-run-status.js'),
    script,
  )
  return directory
}

describe('runStatusVerify', () => {
  it('runs the canonical status runner read-only and parses its document', async () => {
    const directory = await repositoryWithRunner(
      `process.stdout.write(${JSON.stringify(JSON.stringify(DOCUMENT))});`,
    )
    const result = await runStatusVerify(directory)

    expect(result.ok).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.errorCode).toBeNull()
    expect(result.document?.contract?.major).toBe(1)
    expect(result.document?.observation.repository.tctbpVersion).toBe('0.3.6')
    expect(result.document?.observation.fetchPerformed).toBe(false)
  })

  it('reports no-tctbp-surface when the runner is not installed', async () => {
    const directory = await createTemporaryDirectory()
    const result = await runStatusVerify(directory)

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('no-tctbp-surface')
    expect(result.document).toBeNull()
  })

  it('surfaces a non-zero exit from the runner', async () => {
    const directory = await repositoryWithRunner(
      `process.stderr.write('boom'); process.exit(3);`,
    )
    const result = await runStatusVerify(directory)

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('runner-failed')
    expect(result.exitCode).toBe(3)
    expect(result.message).toContain('boom')
  })

  it('reports invalid output when the runner does not emit JSON', async () => {
    const directory = await repositoryWithRunner(
      `process.stdout.write('not json');`,
    )
    const result = await runStatusVerify(directory)

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('invalid-output')
  })

  it('times out a hanging runner', async () => {
    const directory = await repositoryWithRunner(
      `setTimeout(() => process.exit(0), 5000);`,
    )
    const result = await runStatusVerify(directory, { timeoutMs: 150 })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('timeout')
  })
})
