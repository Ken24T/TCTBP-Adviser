import { randomUUID } from 'node:crypto'
import type {
  TctbpBootstrapApplyResult,
  TctbpBootstrapJob,
  TctbpBootstrapProgressStep,
  TctbpBootstrapStepId,
} from '../shared/tctbp-bootstrap'

const STEP_DEFINITIONS: Array<Pick<TctbpBootstrapProgressStep, 'id' | 'label'>> = [
  { id: 'validate', label: 'Validate plan and target state' },
  { id: 'create-branch', label: 'Create dedicated bootstrap branch' },
  { id: 'read-source', label: 'Read canonical TCTBP-Web source' },
  { id: 'write-managed-files', label: 'Write managed infrastructure files' },
  { id: 'write-policy', label: 'Generate target TCTBP policy' },
  { id: 'write-source-metadata', label: 'Write source metadata' },
  { id: 'complete', label: 'Complete without commit or push' },
]

export type BootstrapJobProgress = (
  step: TctbpBootstrapStepId,
  detail?: string,
) => void

export class TctbpBootstrapJobStore {
  readonly #jobs = new Map<string, TctbpBootstrapJob>()

  constructor(
    readonly capacity = 100,
    readonly now: () => Date = () => new Date(),
    readonly createId: () => string = randomUUID,
  ) {}

  create(repositoryId: string): TctbpBootstrapJob {
    const now = this.now().toISOString()
    const job: TctbpBootstrapJob = {
      jobId: this.createId(),
      repositoryId,
      status: 'queued',
      steps: STEP_DEFINITIONS.map((step) => ({
        ...step,
        status: 'pending',
        detail: null,
        updatedAt: null,
      })),
      result: null,
      error: null,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    }
    this.#jobs.set(job.jobId, job)
    this.trim()
    return clone(job)
  }

  get(jobId: string, repositoryId: string): TctbpBootstrapJob | null {
    const job = this.#jobs.get(jobId)
    return job && job.repositoryId === repositoryId ? clone(job) : null
  }

  start(jobId: string): void {
    const job = this.require(jobId)
    job.status = 'running'
    this.touch(job)
  }

  progress(jobId: string): BootstrapJobProgress {
    return (stepId, detail) => {
      const job = this.require(jobId)
      const currentIndex = job.steps.findIndex((step) => step.id === stepId)
      if (currentIndex < 0) return
      for (let index = 0; index < currentIndex; index += 1) {
        if (job.steps[index].status === 'running') job.steps[index].status = 'completed'
      }
      const step = job.steps[currentIndex]
      step.status = stepId === 'complete' ? 'completed' : 'running'
      step.detail = detail ?? null
      step.updatedAt = this.now().toISOString()
      this.touch(job)
    }
  }

  complete(jobId: string, result: TctbpBootstrapApplyResult): void {
    const job = this.require(jobId)
    job.status = 'completed'
    job.result = result
    job.error = null
    for (const step of job.steps) {
      if (step.status === 'running' || step.status === 'pending') step.status = 'completed'
      step.updatedAt = this.now().toISOString()
    }
    job.completedAt = this.now().toISOString()
    this.touch(job)
  }

  fail(jobId: string, error: string): void {
    const job = this.require(jobId)
    job.status = 'failed'
    job.error = error
    const running = job.steps.find((step) => step.status === 'running')
    if (running) {
      running.status = 'failed'
      running.detail = error
      running.updatedAt = this.now().toISOString()
    }
    job.completedAt = this.now().toISOString()
    this.touch(job)
  }

  private require(jobId: string): TctbpBootstrapJob {
    const job = this.#jobs.get(jobId)
    if (!job) throw new Error('Bootstrap job was not found.')
    return job
  }

  private touch(job: TctbpBootstrapJob): void {
    job.updatedAt = this.now().toISOString()
  }

  private trim(): void {
    while (this.#jobs.size > this.capacity) {
      const oldest = this.#jobs.keys().next().value
      if (typeof oldest !== 'string') return
      this.#jobs.delete(oldest)
    }
  }
}

function clone(job: TctbpBootstrapJob): TctbpBootstrapJob {
  return JSON.parse(JSON.stringify(job)) as TctbpBootstrapJob
}
