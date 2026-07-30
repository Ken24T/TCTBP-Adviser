import type { LocalSyncState } from './inspection'
import type {
  RecommendationAction,
  RecommendationDisposition,
  RecommendationReasonCode,
} from './recommendation'

export interface PortfolioRepository {
  id: string
  name: string
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
  repositories: PortfolioRepository[]
}
