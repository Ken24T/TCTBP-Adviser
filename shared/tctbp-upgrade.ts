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
  | 'stale-plan'

export interface TctbpUpgradeBlocker {
  code: TctbpUpgradeBlockerCode
  message: string
}

export type ManagedFileActionCounts = Record<ManagedFileAction, number>

import type { TctbpBootstrapPlan } from './tctbp-bootstrap'
export type { TctbpBootstrapPlan } from './tctbp-bootstrap'

export type TctbpApplyMode = 'additions-only' | 'approved-managed-files'

/** One ordered step of an atomic apply-in-order request. */
export interface TctbpApplyStep {
  mode: TctbpApplyMode
  approvedPaths: string[]
  approvedDeletionPaths: string[]
  confirmDeletions: boolean
}

export interface TctbpApplyRequest {
  confirm: true
  aiReviewId: string
  aiReviewAcknowledged: true
  planFingerprint: string
  mode: TctbpApplyMode
  approvedPaths: string[]
  approvedDeletionPaths: string[]
  confirmDeletions: boolean
  /**
   * Optional ordered in-order steps. When present, all steps are applied in
   * this order within a single request against one plan fingerprint and one
   * Jasper review (no intermediate re-plan), so the whole reviewed plan can
   * be applied together.
   */
  steps?: TctbpApplyStep[]
}

export interface TctbpApplyResult {
  status: 'applied' | 'nothing-to-apply'
  appliedPaths: string[]
  planFingerprint: string
  committed: false
  pushed: false
  /** Branch the apply landed on (the pre-existing branch or the upgrade branch). */
  branch?: string | null
  /** True when this apply created the dedicated upgrade branch. */
  branchCreated?: boolean
}

/**
 * Post-upgrade housekeeping signal: when an upgrade branch exists (created by
 * a previous apply and never removed), describes whether it is safe to delete.
 * Only offered once the branch has been merged back and verified.
 */
export interface TctbpUpgradeCleanup {
  /** The leftover upgrade branch, or null when none exists. */
  branch: string | null
  /** True only when the branch is fully merged, the tree is clean, and it is
   * not the checked-out branch — i.e. deleting it loses nothing. */
  available: boolean
  /** Human-readable reason when cleanup is not available, else null. */
  reason: string | null
}

export interface TctbpCleanupResult {
  status: 'cleaned' | 'nothing-to-clean'
  branch: string | null
  localDeleted: boolean
  remoteDeleted: boolean
  committed: false
  pushed: false
}

/**
 * Result of merging a published upgrade branch back into the environment
 * branch (the working branch for long-lived repos, the production branch
 * otherwise) and pushing it. The merge is fast-forward only, so it refuses
 * when the branches have diverged — a conflict can never be created silently.
 */
export interface TctbpMergeResult {
  status: 'merged'
  /** The upgrade branch that was merged. */
  branch: string | null
  /** The environment branch the upgrade branch was merged into. */
  destinationBranch: string | null
  merged: boolean
  pushed: boolean
  committed: false
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
    /**
     * When the target is checked out on a configured environment branch, this
     * is the dedicated upgrade branch the apply step will create (or reuse)
     * and switch to before writing any managed files. Null when the target is
     * already on a branch the apply can write to directly.
     */
    upgradeBranch?: string | null
  }
  drift: ManagedFileDriftPlan
  actionCounts: ManagedFileActionCounts
  blockers: TctbpUpgradeBlocker[]
  policy: TctbpPolicyComparison
  bootstrap?: TctbpBootstrapPlan
  /** Present when a leftover upgrade branch exists and can be assessed for safe removal. */
  cleanup?: TctbpUpgradeCleanup
}
