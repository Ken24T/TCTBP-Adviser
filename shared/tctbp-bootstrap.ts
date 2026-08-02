export type TctbpBootstrapBranchStrategy =
  | 'simple'
  | 'staged'
  | 'long-lived-environment-branches'

export interface TctbpBootstrapRequest {
  projectName: string
  projectDescription: string
  branchStrategy: TctbpBootstrapBranchStrategy
  workingBranch: string
  preProductionBranch: string | null
  productionBranch: string
  testCommand: string | null
  buildCommand: string | null
  deployEnabled: boolean
  includeHookLayer: boolean
}

export interface TctbpBootstrapApplyRequest {
  confirm: true
  aiReviewId: string
  aiReviewAcknowledged: true
  planFingerprint: string
  request: TctbpBootstrapRequest
}

export interface TctbpBootstrapApplyResult {
  status: 'applied'
  branch: string
  appliedPaths: string[]
  planFingerprint: string
  committed: false
  pushed: false
}

export interface TctbpBootstrapPlan {
  fingerprint?: string
  sourceRevision: string | null
  sourceVersion: string | null
  managedFileCount: number
  recommendedBranch: string | null
  requiredInputs: string[]
  preserveAreas: string[]
  request?: TctbpBootstrapRequest
  targetBranch?: string | null
  targetClean?: boolean
  targetDetached?: boolean
  activeOperationCount?: number
  applyAllowed: false
}
