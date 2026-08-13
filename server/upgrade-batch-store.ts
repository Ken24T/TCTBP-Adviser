import { randomUUID } from 'node:crypto'
import type {
  UpgradeBatchRun,
  UpgradeBatchStageId,
  UpgradeBatchStageStatus,
} from '../shared/upgrade-batch'

export const UPGRADE_BATCH_STAGES: Array<{
  id: UpgradeBatchStageId
  label: string
}> = [
  { id: 'apply', label: 'Apply the upgrade' },
  { id: 'checkpoint', label: 'Checkpoint the changes' },
  { id: 'publish', label: 'Publish the upgrade branch' },
  { id: 'merge', label: 'Merge the upgrade branch' },
  { id: 'cleanup', label: 'Remove the upgrade branch' },
]

/** In-memory store for upgrade batch runs, scoped to a repository. */
export class UpgradeBatchStore {
  readonly #runs = new Map<string, UpgradeBatchRun>()

  constructor(
    readonly capacity = 20,
    readonly now: () => Date = () => new Date(),
    readonly createId: () => string = randomUUID,
  ) {}

  create(repositoryId: string): UpgradeBatchRun {
    const timestamp = this.now().toISOString()
    const run: UpgradeBatchRun = {
      runId: this.createId(),
      repositoryId,
      status: 'queued',
      stages: UPGRADE_BATCH_STAGES.map((stage) => ({
        id: stage.id,
        label: stage.label,
        status: 'pending',
        detail: null,
        updatedAt: null,
      })),
      error: null,
      startedAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    }
    this.#runs.set(run.runId, run)
    while (this.#runs.size > this.capacity) {
      const oldest = this.#runs.keys().next().value
      if (typeof oldest !== 'string') break
      this.#runs.delete(oldest)
    }
    return clone(run)
  }

  get(runId: string, repositoryId: string): UpgradeBatchRun | null {
    const run = this.#runs.get(runId)
    return run && run.repositoryId === repositoryId ? clone(run) : null
  }

  start(runId: string): void {
    const run = this.require(runId)
    run.status = 'running'
    this.touch(run)
  }

  stage(
    runId: string,
    stageId: UpgradeBatchStageId,
    status: UpgradeBatchStageStatus,
    detail: string | null,
  ): void {
    const run = this.require(runId)
    const stage = run.stages.find((candidate) => candidate.id === stageId)
    if (!stage) return
    stage.status = status
    stage.detail = detail
    stage.updatedAt = this.now().toISOString()
    this.touch(run)
  }

  complete(runId: string): void {
    const run = this.require(runId)
    run.status = 'completed'
    run.completedAt = this.now().toISOString()
    this.touch(run)
  }

  fail(runId: string, error: string): void {
    const run = this.require(runId)
    run.status = 'failed'
    run.error = error
    for (const stage of run.stages) {
      if (stage.status === 'pending') stage.status = 'skipped'
    }
    run.completedAt = this.now().toISOString()
    this.touch(run)
  }

  private require(runId: string): UpgradeBatchRun {
    const run = this.#runs.get(runId)
    if (!run) throw new Error('Upgrade batch run was not found.')
    return run
  }

  private touch(run: UpgradeBatchRun): void {
    run.updatedAt = this.now().toISOString()
  }
}

function clone(run: UpgradeBatchRun): UpgradeBatchRun {
  return {
    ...run,
    stages: run.stages.map((stage) => ({ ...stage })),
  }
}
