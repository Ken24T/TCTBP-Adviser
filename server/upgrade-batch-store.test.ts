import { describe, expect, it } from 'vitest'
import type { UpgradeBatchRun } from '../shared/upgrade-batch'
import { UPGRADE_BATCH_STAGES, UpgradeBatchStore } from './upgrade-batch-store'

describe('upgrade batch store', () => {
  it('creates a queued run with pending stages scoped to a repository', () => {
    const store = new UpgradeBatchStore(
      10,
      () => new Date('2026-08-13T00:00:00.000Z'),
      () => 'run-1',
    )
    const run = store.create('repo-1')

    expect(run).toMatchObject({
      runId: 'run-1',
      repositoryId: 'repo-1',
      status: 'queued',
      error: null,
    })
    expect(run.stages).toHaveLength(UPGRADE_BATCH_STAGES.length)
    expect(run.stages.every((stage) => stage.status === 'pending')).toBe(true)
    expect(store.get('run-1', 'repo-1')?.runId).toBe('run-1')
    expect(store.get('run-1', 'other-repo')).toBeNull()
  })

  it('tracks stage status and run completion', () => {
    const store = new UpgradeBatchStore(
      10,
      () => new Date('2026-08-13T00:00:00.000Z'),
      () => 'run-1',
    )
    const run = store.create('repo-1')
    store.start(run.runId)
    store.stage(run.runId, 'apply', 'running', 'Applying additions.')
    store.stage(run.runId, 'apply', 'completed', 'Applied 3 changes.')
    store.stage(run.runId, 'publish', 'skipped', 'No origin remote.')
    store.complete(run.runId)

    const done = store.get(run.runId, 'repo-1') as UpgradeBatchRun
    expect(done.status).toBe('completed')
    expect(done.completedAt).toBe('2026-08-13T00:00:00.000Z')
    expect(done.stages.find((stage) => stage.id === 'apply')).toMatchObject({
      status: 'completed',
      detail: 'Applied 3 changes.',
    })
    expect(done.stages.find((stage) => stage.id === 'publish')).toMatchObject({
      status: 'skipped',
    })
  })

  it('marks pending stages skipped when a run fails', () => {
    const store = new UpgradeBatchStore(
      10,
      () => new Date('2026-08-13T00:00:00.000Z'),
      () => 'run-1',
    )
    const run = store.create('repo-1')
    store.start(run.runId)
    store.stage(run.runId, 'checkpoint', 'failed', 'Checkpoint failed.')
    store.fail(run.runId, 'Checkpoint failed.')

    const failed = store.get(run.runId, 'repo-1') as UpgradeBatchRun
    expect(failed.status).toBe('failed')
    expect(failed.error).toContain('Checkpoint failed')
    expect(failed.stages.find((stage) => stage.id === 'checkpoint')?.status)
      .toBe('failed')
    expect(failed.stages.find((stage) => stage.id === 'publish')?.status)
      .toBe('skipped')
  })
})
