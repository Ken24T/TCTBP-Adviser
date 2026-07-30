import {
  INSPECTION_BASIS,
  type GitOperation,
  type InspectionIssue,
  type LocalSyncState,
  type RepositoryObservation,
} from '../shared/inspection'

export interface ObservationOptions {
  clean?: boolean
  syncState?: LocalSyncState
  operations?: GitOperation[]
  conflicted?: number
  detached?: boolean
  unborn?: boolean
  tctbpInstalled?: boolean
  tctbpCompatible?: boolean
  workflows?: string[]
  observedAt?: string
  errors?: InspectionIssue[]
}

export function observationFixture(
  options: ObservationOptions = {},
): RepositoryObservation {
  const clean = options.clean ?? true
  const syncState = options.syncState ?? 'in-sync'
  const conflicted = options.conflicted ?? 0
  const detached = options.detached ?? false
  const unborn = options.unborn ?? false
  const tracking = trackingValues(syncState)

  return {
    repository: {
      id: 'fixture-repository',
      name: 'fixture',
    },
    observedAt: options.observedAt ?? '2026-07-30T01:00:00.000Z',
    basis: INSPECTION_BASIS,
    fetchPerformed: false,
    head: {
      branch: detached ? null : 'development',
      detached,
      unborn,
      sha: unborn ? null : 'abc123',
    },
    workingTree: {
      clean,
      pathCount: clean ? 0 : Math.max(1, conflicted),
      counts: {
        staged: clean ? 0 : 1,
        modified: 0,
        untracked: 0,
        conflicted,
      },
    },
    operations: options.operations ?? [],
    localTracking: {
      ...tracking,
      state: syncState,
      basis: INSPECTION_BASIS,
    },
    tctbp: {
      installed: options.tctbpInstalled ?? true,
      compatible: options.tctbpCompatible ?? true,
      schemaVersion: 11,
      projectName: 'fixture',
      contract: {
        major: 1,
        minor: 0,
        capabilities: [
          'inspection.local-v1',
          'workflow-catalogue.core-v1',
          'reason-codes.core-v1',
        ],
      },
      workflows: options.workflows ?? [
        'status',
        'checkpoint',
        'publish',
        'resume',
        'handover',
      ],
      scaffold: {
        status: 'complete',
        sourceRepository: 'Ken24T/TCTBP-Web',
        sourceRevision: '0e99cea',
        sourceVersion: '0.2.0',
        managedSurface: [],
        missingManagedPatterns: [],
        uncertainties: [],
      },
      errors: options.errors ?? [],
    },
    errors: options.errors ?? [],
  }
}

function trackingValues(state: LocalSyncState) {
  if (state === 'unpublished') {
    return {
      upstream: null,
      available: false,
      ahead: null,
      behind: null,
    }
  }
  if (state === 'unknown') {
    return {
      upstream: 'origin/development',
      available: true,
      ahead: null,
      behind: null,
    }
  }
  return {
    upstream: 'origin/development',
    available: true,
    ahead: state === 'ahead' || state === 'diverged' ? 1 : 0,
    behind: state === 'behind' || state === 'diverged' ? 1 : 0,
  }
}
