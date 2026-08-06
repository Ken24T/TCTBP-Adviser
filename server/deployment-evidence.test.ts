import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DeploymentEvidenceStore } from './deployment-evidence'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('deployment evidence store', () => {
  it('persists and matches evidence to the exact commit', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tctbp-deploy-evidence-'))
    directories.push(directory)
    const store = new DeploymentEvidenceStore(path.join(directory, 'evidence.json'))
    const evidence = {
      repositoryId: 'repo',
      environment: 'development' as const,
      branch: 'development',
      commitSha: 'a'.repeat(40),
      completedAt: '2026-08-03T00:00:00.000Z',
      workflow: 'deploy-development' as const,
      workflowCompleted: true as const,
      runtimeVerification: 'not-configured' as const,
      summary: 'Workflow completed.',
    }
    await store.record(evidence)

    expect(await store.get('repo', 'development', 'development', evidence.commitSha)).toEqual(evidence)
    expect(await store.get('repo', 'development', 'development', 'b'.repeat(40))).toBeNull()
  })
})
