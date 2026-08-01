export type ManagedFileDriftState =
  | 'current'
  | 'missing-target'
  | 'drifted'
  | 'source-unavailable'

export interface ManagedFileDrift {
  path: string
  state: ManagedFileDriftState
  sourceHash: string | null
  targetHash: string | null
}

export type ManagedFileDriftCounts = Record<ManagedFileDriftState, number>

export interface ManagedFileDriftPlan {
  files: ManagedFileDrift[]
  counts: ManagedFileDriftCounts
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

export interface TctbpUpgradePlan {
  source: CanonicalSourceSummary
  target: {
    sourceRepository: string | null
    sourceRevision: string | null
    sourceVersion: string | null
  }
  drift: ManagedFileDriftPlan
}
