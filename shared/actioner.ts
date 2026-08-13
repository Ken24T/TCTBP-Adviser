import type { RecommendationIntent } from './recommendation'

export type ActionerWorkflowId =
  | 'checkpoint'
  | 'publish'
  | 'deploy-development'
  | 'branch-development'
  | 'repair-tctbp-script-compatibility'
  | 'handover'
  | 'resume'
  | 'promote-review'
  | 'promote-production'
  | 'ship'
  | 'add-origin'
  | 'create-origin'

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

/** Add-origin request: no plan fingerprint — the URL is user-supplied. */
export interface AddOriginRequest {
  workflowId: 'add-origin'
  confirm: true
  url: string
}

/**
 * Create-origin request: creates a GitHub repository under the authenticated
 * account and connects it as origin. No plan fingerprint — the name and
 * visibility are user-supplied.
 */
export interface CreateOriginRequest {
  workflowId: 'create-origin'
  confirm: true
  name: string
  visibility: 'private' | 'public'
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
