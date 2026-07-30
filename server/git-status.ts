import {
  INSPECTION_BASIS,
  type LocalSyncState,
  type LocalTrackingObservation,
  type WorkingTreeCounts,
} from '../shared/inspection'

export interface ParsedGitStatus {
  branch: string | null
  detached: boolean
  unborn: boolean
  sha: string | null
  pathCount: number
  counts: WorkingTreeCounts
  tracking: LocalTrackingObservation
}

export function parsePorcelainV2(output: string): ParsedGitStatus {
  const records = output.split('\0').filter(Boolean)
  const counts: WorkingTreeCounts = {
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicted: 0,
  }
  let branch: string | null = null
  let sha: string | null = null
  let upstream: string | null = null
  let ahead: number | null = null
  let behind: number | null = null
  let pathCount = 0

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record.startsWith('# ')) {
      const [key, ...valueParts] = record.slice(2).split(' ')
      const value = valueParts.join(' ')
      if (key === 'branch.oid' && value !== '(initial)') sha = value
      if (key === 'branch.head' && value !== '(detached)') branch = value
      if (key === 'branch.upstream') upstream = value
      if (key === 'branch.ab') {
        const match = /^\+(\d+) -(\d+)$/.exec(value)
        if (match) {
          ahead = Number(match[1])
          behind = Number(match[2])
        }
      }
      continue
    }

    const kind = record[0]
    if (kind === '?') {
      counts.untracked += 1
      pathCount += 1
      continue
    }
    if (kind === 'u') {
      counts.conflicted += 1
      pathCount += 1
      continue
    }
    if (kind === '1' || kind === '2') {
      const xy = record.slice(2, 4)
      if (xy[0] !== '.') counts.staged += 1
      if (xy[1] !== '.') counts.modified += 1
      pathCount += 1
      if (kind === '2') index += 1
    }
  }

  const detached = branch === null && sha !== null
  const unborn = sha === null
  return {
    branch,
    detached,
    unborn,
    sha,
    pathCount,
    counts,
    tracking: {
      upstream,
      available: upstream !== null,
      ahead,
      behind,
      state: resolveSyncState(upstream, ahead, behind),
      basis: INSPECTION_BASIS,
    },
  }
}

function resolveSyncState(
  upstream: string | null,
  ahead: number | null,
  behind: number | null,
): LocalSyncState {
  if (!upstream) return 'unpublished'
  if (ahead === null || behind === null) return 'unknown'
  if (ahead > 0 && behind > 0) return 'diverged'
  if (ahead > 0) return 'ahead'
  if (behind > 0) return 'behind'
  return 'in-sync'
}
