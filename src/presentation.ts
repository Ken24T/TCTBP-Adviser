import type {
  BranchModelObservation,
  RepositoryObservation,
} from '../shared/inspection'
import type {
  RecommendationAction,
  RecommendationDisposition,
  RecommendationReasonCode,
} from '../shared/recommendation'
import type { TctbpUpgradeBlockerCode } from '../shared/tctbp-upgrade'
import type { PortfolioRepository } from '../shared/portfolio'

const ACTION_LABELS: Record<RecommendationAction, string> = {
  'refresh-inspection': 'Refresh inspection',
  checkpoint: 'Checkpoint',
  publish: 'Publish',
  resume: 'Resume',
  handover: 'Handover',
  'abort-dry-run': 'Inspect abort options',
  'inspect-recovery': 'Investigate safely',
  'reattach-branch': 'Reattach a branch',
  'install-tctbp': 'Install TCTBP',
  'review-compatibility': 'Review compatibility',
}

const REASON_LABELS: Record<RecommendationReasonCode, string> = {
  'active-git-operation': 'A Git operation is active',
  'index-conflicted': 'The index contains conflicts',
  'detached-head': 'HEAD is detached',
  'unborn-repository': 'The repository has no first commit',
  'branch-diverged': 'The branch has diverged',
  'working-tree-dirty-and-behind': 'Local work exists on a behind branch',
  'working-tree-dirty': 'The working tree contains uncommitted work',
  'branch-behind': 'The current branch is behind its tracking ref',
  'branch-unpublished': 'The current branch has no tracking ref',
  'branch-ahead': 'Local commits have not been published',
  'handover-ready': 'The repository is ready for a machine handover',
  'tctbp-not-installed': 'TCTBP is not installed',
  'tctbp-contract-incompatible': 'The Adviser contract is incompatible',
  'inspection-required': 'Fresh or compatible evidence is required',
  'no-action-required': 'The repository is healthy and in sync',
}

const DISPOSITION_LABELS: Record<RecommendationDisposition, string> = {
  action: 'Action recommended',
  sequence: 'Safe sequence',
  stop: 'Stop and investigate',
  inspect: 'Inspection required',
  none: 'No action needed',
}

export function actionLabel(action: RecommendationAction): string {
  return ACTION_LABELS[action]
}

export function reasonLabel(reason: RecommendationReasonCode): string {
  return REASON_LABELS[reason]
}

export function dispositionLabel(
  disposition: RecommendationDisposition,
): string {
  return DISPOSITION_LABELS[disposition]
}

export function formatEvidenceValue(
  value: boolean | number | string | null | string[],
): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'None'
  if (value === null) return 'Unavailable'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function formatAge(ageMs: number | null): string {
  if (ageMs === null || ageMs < 0) return 'Unknown age'
  if (ageMs < 1_000) return 'Observed just now'
  if (ageMs < 60_000) return `Observed ${Math.floor(ageMs / 1_000)} s ago`
  return `Observed ${Math.floor(ageMs / 60_000)} min ago`
}

export function syncSummary(observation: RepositoryObservation): string {
  return syncSummaryFromState(observation.localTracking)
}

export function syncSummaryFromState(tracking: {
  state: RepositoryObservation['localTracking']['state']
  ahead: number | null
  behind: number | null
}): string {
  if (tracking.state === 'unpublished') return 'No upstream branch'
  if (tracking.state === 'unknown') return 'Tracking evidence unavailable'
  if (tracking.state === 'in-sync') return 'In sync'
  const ahead = tracking.ahead ?? 0
  const behind = tracking.behind ?? 0
  if (tracking.state === 'diverged') {
    return `${ahead} ahead · ${behind} behind`
  }
  return tracking.state === 'ahead'
    ? `${ahead} commit${ahead === 1 ? '' : 's'} ahead`
    : `${behind} commit${behind === 1 ? '' : 's'} behind`
}

export function workingTreeSummary(
  observation: RepositoryObservation,
): string {
  const { workingTree } = observation
  if (workingTree.clean) return 'Clean'
  const { staged, modified, untracked, conflicted } = workingTree.counts
  return [
    staged > 0 ? `${staged} staged` : null,
    modified > 0 ? `${modified} modified` : null,
    untracked > 0 ? `${untracked} untracked` : null,
    conflicted > 0 ? `${conflicted} conflicted` : null,
  ].filter((part): part is string => part !== null).join(' · ')
}

export function branchRoles(model: BranchModelObservation) {
  return [
    { role: 'Working', branch: model.workingBranch },
    { role: 'Pre-production', branch: model.preProductionBranch },
    { role: 'Production', branch: model.productionBranch },
  ].filter(
    (entry): entry is { role: string; branch: string } =>
      entry.branch !== null,
  )
}

/** Card severity tone, mirroring the recommendation's colour family. */
export function portfolioTone(
  repository: PortfolioRepository,
): 'action-recommended' | 'attention' | 'stop' | 'healthy' {
  if (repository.source === 'github-only') {
    return repository.github.status === 'available' ? 'healthy' : 'attention'
  }
  if (!repository.available) return 'stop'
  return repository.recommendation?.severity ?? 'attention'
}

/** The one-line "Recommended" action shown on the card face. */
export function recommendationTitle(repository: PortfolioRepository): string {
  if (repository.source === 'github-only') {
    return repository.github.status === 'available'
      ? 'Local recommendation unavailable'
      : 'GitHub evidence unavailable'
  }
  if (!repository.available) return 'Inspection unavailable'
  const recommendation = repository.recommendation
  if (!recommendation) return 'Recommendation unavailable'
  return recommendationTitleFor(recommendation)
}

/** The "Recommended" title derived directly from a recommendation result. */
export function recommendationTitleFor(
  recommendation: {
    disposition: RecommendationDisposition
    primaryAction: RecommendationAction | null
    reasonCodes: RecommendationReasonCode[]
  } | null,
): string {
  if (!recommendation) return 'Recommendation unavailable'
  // A checkpoint-first sequence (incompatible contract + dirty tree) leads
  // with the checkpoint; the contract reasons still surface in the callout.
  if (
    recommendation.disposition === 'sequence'
    && recommendation.primaryAction === 'checkpoint'
    && recommendation.reasonCodes.includes('tctbp-contract-incompatible')
  ) {
    return 'Checkpoint'
  }
  if (recommendation.reasonCodes.includes('tctbp-not-installed')) {
    return 'Install TCTBP'
  }
  if (recommendation.reasonCodes.includes('tctbp-contract-incompatible')) {
    return 'Review TCTBP compatibility'
  }
  return recommendation.primaryAction
    ? actionLabel(recommendation.primaryAction)
    : dispositionLabel(recommendation.disposition)
}

export function tctbpLabel(repository: PortfolioRepository): string {
  if (!repository.tctbp) return 'TCTBP unknown'
  if (!repository.tctbp.installed) return 'TCTBP not installed'
  if (!repository.tctbp.compatible) return 'TCTBP incompatible'
  return `TCTBP schema ${repository.tctbp.schemaVersion ?? 'unknown'}`
}

export function upgradeLabel(
  disposition: NonNullable<PortfolioRepository['upgrade']>['disposition'],
): string {
  if (disposition === 'current') return 'TCTBP current'
  if (disposition === 'bootstrap-required') return 'TCTBP bootstrap required'
  if (disposition === 'source-unavailable') return 'TCTBP source unavailable'
  return 'TCTBP review required'
}

/** A "how to resolve" hint for a workflow blocker, or null when unknown. */
export function blockerHint(code: string): string | null {
  const hints: Record<TctbpUpgradeBlockerCode, string> = {
    'working-tree-dirty': 'Commit or stash local changes first — or checkpoint them.',
    'active-git-operation': 'Wait for the running Git operation to finish before retrying.',
    'detached-head': 'Reattach to a branch first (e.g. git switch development).',
    'source-unavailable': 'Make the canonical TCTBP-Web source available, then retry.',
    'policy-unavailable': 'Ensure both policies can be compared (fetch or pull), then retry.',
    'managed-source-unavailable': 'A canonical managed file could not be read — check the TCTBP-Web checkout.',
    'different-source': 'Regenerate from the canonical Ken24T/TCTBP-Web source.',
    'environment-branch': 'Switch to a branch the target environment is configured for.',
    'stale-plan': 'Refresh the plan so its fingerprint matches the current repository state.',
  }
  return hints[code as TctbpUpgradeBlockerCode] ?? null
}
