import type { LocalSyncState } from './inspection'
import type { RepositoryGitHubEvidence } from './github'
import type {
  ManagedFileActionCounts,
  TctbpSourceAlignment,
  TctbpUpgradeDisposition,
} from './tctbp-upgrade'
import type {
  RecommendationAction,
  RecommendationDisposition,
  RecommendationReasonCode,
} from './recommendation'

export interface PortfolioRepository {
  id: string
  name: string
  source: 'local' | 'github-only'
  available: boolean
  observedAt: string | null
  head: {
    branch: string | null
    detached: boolean
  } | null
  workingTree: {
    clean: boolean
    pathCount: number
  } | null
  localTracking: {
    state: LocalSyncState
    ahead: number | null
    behind: number | null
  } | null
  tctbp: {
    installed: boolean
    compatible: boolean
    schemaVersion: number | null
  } | null
  recommendation: {
    disposition: RecommendationDisposition
    primaryAction: RecommendationAction | null
    reasonCodes: RecommendationReasonCode[]
    severity: 'action-recommended' | 'attention' | 'stop' | 'healthy'
  } | null
  error: {
    code: string
    message: string
  } | null
  directoryName?: string | null
  faviconPath?: string | null
  github: RepositoryGitHubEvidence
  upgrade?: PortfolioUpgradeSummary | null
}

export interface PortfolioUpgradeSummary {
  disposition: TctbpUpgradeDisposition
  sourceAlignment: TctbpSourceAlignment
  actionCounts: ManagedFileActionCounts
  blockerCount: number
  policyDifferenceCount: number
  reasons: string[]
}

export interface PortfolioUpgradeTotals {
  enabled: boolean
  current: number
  reviewRequired: number
  bootstrapRequired: number
  blocked: number
  sourceUnavailable: number
}

export interface PortfolioSnapshot {
  generatedAt: string
  cache: {
    status: 'fresh' | 'refreshed'
    ageMs: number
    ttlMs: number
  }
  discovery: {
    scannedAt: string
    repositoryCount: number
    rootCount: number
    issues: Array<{ code: string; message: string }>
  }
  github: {
    enabled: boolean
    localMappings: number
    githubOnly: number
    unavailable: number
  }
  upgrade?: PortfolioUpgradeTotals
  repositories: PortfolioRepository[]
}
