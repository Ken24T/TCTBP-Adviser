export type ActionerWorkflowId =
  | 'checkpoint'
  | 'publish'
  | 'deploy-development'
  | 'branch-development'
  | 'repair-tctbp-script-compatibility'

import type { RecommendationIntent } from './recommendation'

export type ActionerIntent = Exclude<RecommendationIntent, 'none'>

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
  intent: ActionerIntent
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
  commitSha: string | null
  branch: string | null
  pushed: boolean | null
  remote: string | null
  verifiedClean: boolean
  summary: string | null
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
