/**
 * Shared contract for the "run the whole upgrade journey" batch. The ordered
 * execution stages mirror the post-review upgrade journey (apply → checkpoint
 * → publish → merge → cleanup); each is re-validated at run time and the run
 * stops on the first failure so nothing is ever applied blindly.
 */

export type UpgradeBatchStageId =
  | 'apply'
  | 'checkpoint'
  | 'publish'
  | 'merge'
  | 'cleanup'

export type UpgradeBatchStageStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface UpgradeBatchStageState {
  id: UpgradeBatchStageId
  label: string
  status: UpgradeBatchStageStatus
  detail: string | null
  updatedAt: string | null
}

export type UpgradeBatchRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'

/**
 * Start request for a batch run. Carries the same Jasper-review handshake as
 * a single apply: the review must be available, acknowledged, and match the
 * plan fingerprint before any stage executes.
 */
export interface UpgradeBatchRequest {
  confirm: true
  aiReviewId: string
  aiReviewAcknowledged: true
  planFingerprint: string
}

export interface UpgradeBatchRun {
  runId: string
  repositoryId: string
  status: UpgradeBatchRunStatus
  stages: UpgradeBatchStageState[]
  error: string | null
  startedAt: string
  updatedAt: string
  completedAt: string | null
}
