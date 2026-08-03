export type ActionerWorkflowId = 'checkpoint'

export type ActionerJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'

export type ActionerStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'

export interface ActionerRequest {
  workflowId: ActionerWorkflowId
  intent: 'preserve-locally'
  planFingerprint: string
  confirm: true
}

export interface ActionerStep {
  id: 'validate' | 'execute' | 'reinspect' | 'complete'
  label: string
  status: ActionerStepStatus
  detail: string | null
  updatedAt: string | null
}

export interface ActionerResult {
  workflowId: ActionerWorkflowId
  commitSha: string
  branch: string | null
  pushed: false
  verifiedClean: boolean
}

export interface ActionerJob {
  jobId: string
  repositoryId: string
  workflowId: ActionerWorkflowId
  status: ActionerJobStatus
  steps: ActionerStep[]
  result: ActionerResult | null
  error: string | null
  startedAt: string
  updatedAt: string
  completedAt: string | null
}

export interface ActionerJobStart {
  jobId: string
  status: 'started'
}
