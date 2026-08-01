import type {
  CanonicalSourceSummary,
  ManagedFileAction,
  ManagedFileActionCounts,
  ManagedFileDriftPlan,
  TctbpPolicyComparison,
  TctbpSourceAlignment,
  TctbpUpgradeBlocker,
  TctbpUpgradeDisposition,
  TctbpUpgradePlan,
} from '../shared/tctbp-upgrade'

export interface UpgradeAssessmentInput {
  source: CanonicalSourceSummary
  target: TctbpUpgradePlan['target']
  drift: ManagedFileDriftPlan
  policy: TctbpPolicyComparison
  targetState: {
    detached: boolean
    operationCount: number
    workingTreeClean: boolean
  }
}

export interface UpgradeAssessment {
  disposition: TctbpUpgradeDisposition
  sourceAlignment: TctbpSourceAlignment
  actionCounts: ManagedFileActionCounts
  blockers: TctbpUpgradeBlocker[]
}

export function assessTctbpUpgrade(
  input: UpgradeAssessmentInput,
): UpgradeAssessment {
  const sourceAlignment = resolveSourceAlignment(input.source, input.target)
  const actionCounts = countActions(input.drift)
  const blockers = resolveBlockers(input, sourceAlignment)
  const hasReviewWork = (
    sourceAlignment !== 'current'
    || input.policy.state !== 'aligned'
    || actionCounts.add > 0
    || actionCounts.review > 0
    || actionCounts.unavailable > 0
  )

  return {
    disposition: input.source.state !== 'available'
      ? 'source-unavailable'
      : blockers.length > 0 || hasReviewWork
        ? 'review-required'
        : 'current',
    sourceAlignment,
    actionCounts,
    blockers,
  }
}

function resolveSourceAlignment(
  source: CanonicalSourceSummary,
  target: TctbpUpgradePlan['target'],
): TctbpSourceAlignment {
  if (source.state !== 'available' || !source.revision) return 'unknown'
  if (
    target.sourceRepository
    && target.sourceRepository !== 'Ken24T/TCTBP-Web'
  ) return 'different-source'
  if (!target.sourceRevision) return 'unknown'
  return target.sourceRevision === source.revision ? 'current' : 'outdated'
}

function countActions(drift: ManagedFileDriftPlan): ManagedFileActionCounts {
  const counts: ManagedFileActionCounts = {
    preserve: 0,
    add: 0,
    review: 0,
    unavailable: 0,
  }
  for (const file of drift.files) counts[file.action] += 1
  return counts
}

function resolveBlockers(
  input: UpgradeAssessmentInput,
  sourceAlignment: TctbpSourceAlignment,
): TctbpUpgradeBlocker[] {
  const blockers: TctbpUpgradeBlocker[] = []
  if (input.source.state !== 'available') {
    blockers.push({
      code: 'source-unavailable',
      message: input.source.message ?? 'Canonical TCTBP-Web source is unavailable.',
    })
  }
  if (sourceAlignment === 'different-source') {
    blockers.push({
      code: 'different-source',
      message: 'The target was generated from a different TCTBP source repository.',
    })
  }
  if (input.policy.state === 'unavailable') {
    blockers.push({
      code: 'policy-unavailable',
      message: 'Canonical or target TCTBP policy could not be compared.',
    })
  }
  if (input.drift.counts['source-unavailable'] > 0) {
    blockers.push({
      code: 'managed-source-unavailable',
      message: 'One or more canonical managed files could not be read.',
    })
  }
  if (input.targetState.workingTreeClean === false) {
    blockers.push({
      code: 'working-tree-dirty',
      message: 'The target working tree contains local changes.',
    })
  }
  if (input.targetState.operationCount > 0) {
    blockers.push({
      code: 'active-git-operation',
      message: 'The target repository has an active Git operation.',
    })
  }
  if (input.targetState.detached) {
    blockers.push({
      code: 'detached-head',
      message: 'The target repository is on a detached HEAD.',
    })
  }
  return blockers
}
