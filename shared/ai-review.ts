import type {
  ManagedFileActionCounts,
  ManagedFileDrift,
  TctbpPolicyDifference,
  TctbpUpgradeBlocker,
  TctbpUpgradeDisposition,
  TctbpSourceAlignment,
} from './tctbp-upgrade'

export type UpgradeEvidenceReference =
  | 'plan.disposition'
  | 'plan.sourceAlignment'
  | 'target.tctbpInstalled'
  | 'target.policyAvailable'
  | 'target.branch'
  | 'target.workingTreeClean'
  | 'target.detached'
  | 'plan.fileActions'
  | 'plan.blockers'
  | 'plan.policyDifferences'

export interface UpgradeReviewEvidence {
  evidenceVersion: 1
  repositoryName: string
  planFingerprint: string | null
  disposition: TctbpUpgradeDisposition
  sourceAlignment: TctbpSourceAlignment
  source: {
    repository: string | null
    version: string | null
    revision: string | null
  }
  target: {
    branch: string | null
    headSha: string | null
    tctbpInstalled: boolean
    policyAvailable: boolean
    workingTreeClean: boolean
    detached: boolean
    sourceRepository: string | null
    sourceVersion: string | null
  }
  actionCounts: ManagedFileActionCounts
  files: ManagedFileDrift[]
  blockers: TctbpUpgradeBlocker[]
  policyDifferences: TctbpPolicyDifference[]
  truncated: boolean
}

export interface AiReviewRisk {
  message: string
  evidenceRefs: UpgradeEvidenceReference[]
}

export type AiReviewStatus =
  | 'available'
  | 'disabled'
  | 'unavailable'
  | 'invalid'

export interface AiReviewResult {
  status: AiReviewStatus
  reviewId: string
  reviewedAt: string
  provider: string | null
  model: string | null
  planFingerprint: string | null
  summary: string | null
  risks: AiReviewRisk[]
  recommendedNextStep: string | null
  confidence: 'low' | 'medium' | 'high' | 'unknown'
  unknowns: string[]
  error: string | null
}
