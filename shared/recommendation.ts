import type { InspectionIssue } from './inspection'

export const RECOMMENDATION_INTENTS = [
  'none',
  'preserve-locally',
  'preserve-and-publish',
  'continue-on-another-machine',
  'resume-after-machine-change',
  'prepare-pre-production',
  'deploy-current-environment',
  'prepare-production-release',
  'recover-interrupted-workflow',
] as const

export type RecommendationIntent =
  typeof RECOMMENDATION_INTENTS[number]

export type RecommendationDisposition =
  | 'action'
  | 'sequence'
  | 'stop'
  | 'inspect'
  | 'none'

export type RecommendationAction =
  | 'refresh-inspection'
  | 'checkpoint'
  | 'publish'
  | 'resume'
  | 'handover'
  | 'abort-dry-run'
  | 'inspect-recovery'
  | 'reattach-branch'
  | 'install-tctbp'
  | 'review-compatibility'
  | 'update-tctbp'

export type RecommendationReasonCode =
  | 'active-git-operation'
  | 'index-conflicted'
  | 'detached-head'
  | 'unborn-repository'
  | 'branch-diverged'
  | 'working-tree-dirty-and-behind'
  | 'working-tree-dirty'
  | 'branch-behind'
  | 'branch-unpublished'
  | 'branch-ahead'
  | 'handover-ready'
  | 'tctbp-not-installed'
  | 'tctbp-contract-incompatible'
  | 'tctbp-update-available'
  | 'inspection-required'
  | 'no-action-required'

export interface RecommendationEvidence {
  field: string
  value: boolean | number | string | null | string[]
  basis: string
  observedAt: string
}

export interface BlockedAction {
  action: RecommendationAction
  reasonCodes: RecommendationReasonCode[]
}

export interface RecommendationStep {
  action: RecommendationAction
  trigger: string | null
  kind: 'workflow' | 'diagnostic' | 'guidance'
}

export interface RecommendationFreshness {
  observedAt: string
  evaluatedAt: string
  ageMs: number | null
  stale: boolean
  basis: string
}

export interface RecommendationResult {
  disposition: RecommendationDisposition
  primaryAction: RecommendationAction | null
  trigger: string | null
  reasonCodes: RecommendationReasonCode[]
  severity: 'action-recommended' | 'attention' | 'stop' | 'healthy'
  confidence: 'deterministic'
  intent: RecommendationIntent
  steps: RecommendationStep[]
  requiredBefore: RecommendationAction[]
  blockedActions: BlockedAction[]
  likelyNextActions: RecommendationAction[]
  evidence: RecommendationEvidence[]
  uncertainties: InspectionIssue[]
  policySource: {
    engine: 'tctbp-adviser/recommendation-v1'
    tctbpSchemaVersion: number | null
    contractMajor: number | null
    capabilities: string[]
  }
  observationIds: string[]
  freshness: RecommendationFreshness
  effects: {
    does: string[]
    doesNot: string[]
  }
}
