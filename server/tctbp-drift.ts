import { createHash } from 'node:crypto'
import type {
  ManagedFileDrift,
  ManagedFileDriftCounts,
  ManagedFileDriftPlan,
  ManagedFileDriftState,
} from '../shared/tctbp-upgrade'

export type {
  ManagedFileDrift,
  ManagedFileDriftCounts,
  ManagedFileDriftPlan,
  ManagedFileDriftState,
} from '../shared/tctbp-upgrade'

export function hashFileContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function planManagedFileDrift(
  managedPaths: readonly string[],
  sourceFiles: ReadonlyMap<string, string>,
  targetFiles: ReadonlyMap<string, string>,
): ManagedFileDriftPlan {
  const paths = Array.from(new Set(managedPaths)).sort()
  const files = paths.map((path) => classifyFile(path, sourceFiles, targetFiles))
  const counts = emptyCounts()

  for (const file of files) counts[file.state] += 1

  return { files, counts }
}

export function emptyManagedFileDriftPlan(): ManagedFileDriftPlan {
  return { files: [], counts: emptyCounts() }
}

function classifyFile(
  path: string,
  sourceFiles: ReadonlyMap<string, string>,
  targetFiles: ReadonlyMap<string, string>,
): ManagedFileDrift {
  const sourceContent = sourceFiles.get(path)
  const targetContent = targetFiles.get(path)
  const sourceHash = sourceContent === undefined
    ? null
    : hashFileContent(sourceContent)
  const targetHash = targetContent === undefined
    ? null
    : hashFileContent(targetContent)

  if (sourceHash === null) {
    return { path, state: 'source-unavailable', sourceHash, targetHash }
  }
  if (targetHash === null) {
    return { path, state: 'missing-target', sourceHash, targetHash }
  }
  return {
    path,
    state: sourceHash === targetHash ? 'current' : 'drifted',
    sourceHash,
    targetHash,
  }
}

function emptyCounts(): ManagedFileDriftCounts {
  return {
    current: 0,
    'missing-target': 0,
    drifted: 0,
    'source-unavailable': 0,
  }
}
