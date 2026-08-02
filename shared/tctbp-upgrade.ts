export type ManagedFileDriftState =
  | 'current'
  | 'missing-target'
  | 'drifted'
  | 'source-unavailable'

export type ManagedFileAction =
  | 'preserve'
  | 'add'
  | 'review'
  | 'unavailable'

export interface ManagedFileDrift {
  path: string
  state: ManagedFileDriftState
  action: ManagedFileAction
  sourceHash: string | null
  targetHash: string | null
}

export type ManagedFileDriftCounts = Record<ManagedFileDriftState, number>

export interface ObsoleteManagedFile {
  path: string
  targetHash: string
}

export interface ManagedFileDriftPlan {
  files: ManagedFileDrift[]
  counts: ManagedFileDriftCounts
  obsoleteTargets?: ObsoleteManagedFile[]
}

export type CanonicalSourceState =
  | 'available'
  | 'not-configured'
  | 'unavailable'

export interface CanonicalSourceSummary {
  state: CanonicalSourceState
  repository: string | null
  revision: string | null
  version: string | null
  managedFileCount: number
  message: string | null
}

export type TctbpPolicyDifferenceArea =
  | 'schema'
  | 'contract'
  | 'capabilities'
  | 'workflows'
  | 'hardening'
  | 'policy'

export interface TctbpPolicyDifference {
  area: TctbpPolicyDifferenceArea
  message: string
}

export interface TctbpPolicyComparison {
  state: 'aligned' | 'drifted' | 'unavailable'
  differences: TctbpPolicyDifference[]
}

export type TctbpUpgradeDisposition =
  | 'current'
  | 'review-required'
  | 'bootstrap-required'
  | 'source-unavailable'

export type TctbpSourceAlignment =
  | 'current'
  | 'outdated'
  | 'unknown'
  | 'different-source'

export type TctbpUpgradeBlockerCode =
  | 'working-tree-dirty'
  | 'active-git-operation'
  | 'detached-head'
  | 'source-unavailable'
  | 'policy-unavailable'
  | 'managed-source-unavailable'
  | 'different-source'
  | 'environment-branch'
  | 'stale-plan'

export interface TctbpUpgradeBlocker {
  code: TctbpUpgradeBlockerCode
  message: string
}

export type ManagedFileActionCounts = Record<ManagedFileAction, number>

export interface TctbpBootstrapPlan {
  sourceRevision: string | null
  sourceVersion: string | null
  managedFileCount: number
  recommendedBranch: string | null
  requiredInputs: string[]
  preserveAreas: string[]
  applyAllowed: false
}

export type TctbpApplyMode = 'additions-only' | 'approved-managed-files'

export interface TctbpApplyRequest {
  confirm: true
  planFingerprint: string
  mode: TctbpApplyMode
  approvedPaths: string[]
  approvedDeletionPaths: string[]
  confirmDeletions: boolean
}

export interface TctbpApplyResult {
  status: 'applied' | 'nothing-to-apply'
  appliedPaths: string[]
  planFingerprint: string
  committed: false
  pushed: false
}

export interface TctbpUpgradePlan {
  disposition: TctbpUpgradeDisposition
  fingerprint?: string
  sourceAlignment: TctbpSourceAlignment
  source: CanonicalSourceSummary
  target: {
    branch?: string | null
    headSha?: string | null
    sourceRepository: string | null
    sourceRevision: string | null
    sourceVersion: string | null
  }
  drift: ManagedFileDriftPlan
  actionCounts: ManagedFileActionCounts
  blockers: TctbpUpgradeBlocker[]
  policy: TctbpPolicyComparison
  bootstrap?: TctbpBootstrapPlan
}
