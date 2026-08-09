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
    environmentBranch: boolean
    tctbpInstalled: boolean
    targetPolicyAvailable: boolean
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
    || (input.drift.obsoleteTargets?.length ?? 0) > 0
  )
  // The environment-branch blocker only constrains *where* changes may be
  // applied (a dedicated upgrade branch); it is not evidence that the managed
  // surface needs work. When the surface is otherwise fully aligned, being on
  // an environment branch alone must not force 'review-required' — that would
  // surface a spurious "Update TCTBP" on every clean, current repo checked out
  // on development/review/main.
  const applyOnlyBlocker = (
    blockers.length === 1
    && blockers[0]?.code === 'environment-branch'
  )
  const reviewWorkRequired = (
    hasReviewWork
    || (blockers.length > 0 && !applyOnlyBlocker)
  )

  return {
    disposition: input.source.state !== 'available'
      ? 'source-unavailable'
      : !input.targetState.tctbpInstalled || !input.targetState.targetPolicyAvailable
        ? 'bootstrap-required'
        : reviewWorkRequired
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
  // A recorded source revision is the source of truth: the target was
  // scaffolded from that revision, so compare directly.
  if (target.sourceRevision) {
    return target.sourceRevision === source.revision ? 'current' : 'outdated'
  }
  // No source record: this is the canonical source repo itself (the origin
  // does not scaffold from anywhere). When its HEAD equals the canonical
  // revision, its managed surface is by definition the source surface, so
  // align it as current instead of reporting an empty-record 'unknown'.
  if (target.headSha && target.headSha === source.revision) return 'current'
  return 'unknown'
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
  if (input.targetState.environmentBranch) {
    blockers.push({
      code: 'environment-branch',
      message: 'The target is on a configured environment branch; use a dedicated upgrade branch.',
    })
  }
  return blockers
}
