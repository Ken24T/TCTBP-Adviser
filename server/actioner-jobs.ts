import { randomUUID } from 'node:crypto'
import type {
  ActionerJob,
  ActionerResult,
  ActionerStep,
  ActionerWorkflowId,
} from '../shared/actioner'

function stepDefinitions(workflowId: ActionerWorkflowId): Array<Pick<ActionerStep, 'id' | 'label'>> {
  return [
    { id: 'validate', label: `Validate ${workflowId} plan and target state` },
    { id: 'execute', label: workflowId === 'checkpoint'
      ? 'Create local checkpoint commit'
      : workflowId === 'publish'
        ? 'Publish current branch to origin'
        : workflowId === 'deploy-development'
        ? 'Execute development deployment'
        : workflowId === 'branch-development'
          ? 'Create development branch'
          : 'Repair TCTBP script compatibility' },
    { id: 'reinspect', label: 'Re-inspect repository state' },
    { id: 'complete', label: workflowId === 'checkpoint'
      ? 'Complete without push'
      : workflowId === 'publish'
        ? 'Complete with verified remote state'
        : workflowId === 'deploy-development'
          ? 'Complete with deployment result'
          : workflowId === 'branch-development'
            ? 'Complete with local branch result'
            : 'Complete with compatibility repair result' },
  ]
}

export class ActionerJobStore {
  readonly #jobs = new Map<string, ActionerJob>()

  constructor(
    readonly capacity = 100,
    readonly now: () => Date = () => new Date(),
    readonly createId: () => string = randomUUID,
  ) {}

  create(repositoryId: string, workflowId: ActionerWorkflowId): ActionerJob {
    const timestamp = this.now().toISOString()
    const job: ActionerJob = {
      jobId: this.createId(),
      repositoryId,
      workflowId,
      status: 'queued',
      steps: stepDefinitions(workflowId).map((step) => ({
        ...step,
        status: 'pending',
        detail: null,
        updatedAt: null,
      })),
      result: null,
      error: null,
      startedAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    }
    this.#jobs.set(job.jobId, job)
    while (this.#jobs.size > this.capacity) {
      const oldest = this.#jobs.keys().next().value
      if (typeof oldest !== 'string') break
      this.#jobs.delete(oldest)
    }
    return clone(job)
  }

  get(jobId: string, repositoryId: string): ActionerJob | null {
    const job = this.#jobs.get(jobId)
    return job && job.repositoryId === repositoryId ? clone(job) : null
  }

  start(jobId: string): void {
    const job = this.require(jobId)
    job.status = 'running'
    this.touch(job)
  }

  progress(jobId: string, stepId: ActionerStep['id'], detail?: string): void {
    const job = this.require(jobId)
    const index = job.steps.findIndex((step) => step.id === stepId)
    if (index < 0) return
    for (let stepIndex = 0; stepIndex < index; stepIndex += 1) {
      if (job.steps[stepIndex].status === 'running') job.steps[stepIndex].status = 'completed'
    }
    const step = job.steps[index]
    step.status = stepId === 'complete' ? 'completed' : 'running'
    step.detail = detail ?? null
    step.updatedAt = this.now().toISOString()
    this.touch(job)
  }

  complete(jobId: string, result: ActionerResult): void {
    const job = this.require(jobId)
    job.status = 'completed'
    job.result = result
    for (const step of job.steps) {
      if (step.status === 'pending' || step.status === 'running') step.status = 'completed'
      step.updatedAt = this.now().toISOString()
    }
    job.completedAt = this.now().toISOString()
    this.touch(job)
  }

  fail(jobId: string, error: string): void {
    const job = this.require(jobId)
    job.status = 'failed'
    job.error = error
    const step = job.steps.find((candidate) => candidate.status === 'running')
    if (step) {
      step.status = 'failed'
      step.detail = error
      step.updatedAt = this.now().toISOString()
    }
    job.completedAt = this.now().toISOString()
    this.touch(job)
  }

  private require(jobId: string): ActionerJob {
    const job = this.#jobs.get(jobId)
    if (!job) throw new Error('Actioner job was not found.')
    return job
  }

  private touch(job: ActionerJob): void {
    job.updatedAt = this.now().toISOString()
  }
}

function clone(job: ActionerJob): ActionerJob {
  return JSON.parse(JSON.stringify(job)) as ActionerJob
}
