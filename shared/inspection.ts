export const INSPECTION_BASIS =
  'local-working-copy-and-local-tracking-refs' as const

export type GitOperation =
  | 'merge'
  | 'rebase'
  | 'cherry-pick'
  | 'revert'
  | 'bisect'

export type LocalSyncState =
  | 'in-sync'
  | 'ahead'
  | 'behind'
  | 'diverged'
  | 'unpublished'
  | 'unknown'

export interface WorkingTreeCounts {
  staged: number
  modified: number
  untracked: number
  conflicted: number
}

export interface LocalTrackingObservation {
  upstream: string | null
  available: boolean
  ahead: number | null
  behind: number | null
  state: LocalSyncState
  basis: typeof INSPECTION_BASIS
}

export interface TctbpContractObservation {
  major: number | null
  minor: number | null
  capabilities: string[]
}

export interface ScaffoldHealthObservation {
  status: 'complete' | 'incomplete' | 'unknown'
  sourceRepository: string | null
  sourceRevision: string | null
  sourceVersion: string | null
  managedSurface: string[]
  missingManagedPatterns: string[]
  uncertainties: string[]
}

export interface TctbpObservation {
  installed: boolean
  compatible: boolean
  schemaVersion: number | null
  projectName: string | null
  contract: TctbpContractObservation
  scaffold: ScaffoldHealthObservation
  errors: InspectionIssue[]
}

export interface InspectionIssue {
  code: string
  message: string
}

export interface RepositoryObservation {
  repository: {
    id: string
    name: string
  }
  observedAt: string
  basis: typeof INSPECTION_BASIS
  fetchPerformed: false
  head: {
    branch: string | null
    detached: boolean
    unborn: boolean
    sha: string | null
  }
  workingTree: {
    clean: boolean
    pathCount: number
    counts: WorkingTreeCounts
  }
  operations: GitOperation[]
  localTracking: LocalTrackingObservation
  tctbp: TctbpObservation
  errors: InspectionIssue[]
}

export interface RepositorySummary {
  id: string
  name: string
}
