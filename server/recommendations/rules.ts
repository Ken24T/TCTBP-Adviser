// TCTBP file-size justification: this module holds every recommendation rule
// as a pure function over the shared EvaluationContext, so the engine can
// dispatch to them in a stable order. The rules share the context type and
// the block/evidence helpers at the bottom of the file; splitting them would
// duplicate that shared plumbing.
import type { RepositoryObservation } from '../../shared/inspection'
import type {
  BlockedAction,
  RecommendationAction,
  RecommendationEvidence,
  RecommendationIntent,
  RecommendationReasonCode,
  RecommendationResult,
} from '../../shared/recommendation'
import type { TctbpUpgradeDisposition } from '../../shared/tctbp-upgrade'
import type { ManagedFileActionCounts } from '../../shared/tctbp-upgrade'

const BLOCKABLE_WORKFLOWS: RecommendationAction[] = [
  'checkpoint',
  'publish',
  'resume',
  'handover',
]

export interface UpgradeSummaryLike {
  disposition: TctbpUpgradeDisposition
  actionCounts?: ManagedFileActionCounts
}

export interface ResultDefinition {
  disposition: RecommendationResult['disposition']
  primaryAction: RecommendationAction | null
  reasonCodes: RecommendationReasonCode[]
  severity: RecommendationResult['severity']
  actions?: RecommendationAction[]
  requiredBefore?: RecommendationAction[]
  blockedActions?: BlockedAction[]
  likelyNextActions?: RecommendationAction[]
  evidence: RecommendationEvidence[]
  uncertainties?: RecommendationResult['uncertainties']
}

export interface EvaluationContext {
  observation: RepositoryObservation
  intent: RecommendationIntent
  evaluatedAt: Date
  maxAgeMs: number
  ageMs: number | null
  stale: boolean
  upgrade: UpgradeSummaryLike | null
}

export function resolveDefinition(
  context: EvaluationContext,
): ResultDefinition {
  const { observation } = context
  const dirty = !observation.workingTree.clean
  const behind = observation.localTracking.state === 'behind'

  if (context.stale) return staleDefinition(context)
  if (!observation.tctbp.installed) return tctbpMissing(context)
  if (!observation.tctbp.compatible) {
    // A dirty tree blocks the compatibility fix from being applied (the apply
    // is refused while the working tree has local changes), so the user's
    // uncommitted work must be preserved first. Preserve it via a checkpoint
    // sequence, then fix the contract. Conflicts and active operations still
    // outrank this: checkpointing a conflicted tree is not safe.
    const interruption = (
      observation.operations.length > 0
      || observation.workingTree.counts.conflicted > 0
    )
    if (dirty && !interruption) {
      return incompatibleWithLocalChanges(context)
    }
    return tctbpIncompatible(context)
  }
  if (
    observation.operations.length > 0
    || observation.workingTree.counts.conflicted > 0
  ) return interruptedOperation(context)
  if (observation.head.unborn) return unbornRepository(context)
  if (observation.head.detached) return detachedHead(context)
  if (observation.localTracking.state === 'diverged') {
    return divergedBranch(context)
  }
  if (dirty && behind) return dirtyAndBehind(context)
  if (observation.localTracking.state === 'unknown') {
    return unknownTracking(context)
  }
  if (behind) return workflowAction(context, 'resume', 'branch-behind')

  const intentDefinition = applyIntent(context)
  if (intentDefinition) return intentDefinition

  if (dirty) {
    return workflowAction(
      context,
      'checkpoint',
      'working-tree-dirty',
      ['publish', 'preflight'],
    )
  }
  if (observation.localTracking.state === 'unpublished') {
    if (!observation.remoteOrigin) {
      // A TCTBP update is locally actionable (apply touches only the working
      // tree and needs no remote), so it outranks the missing-remote notice;
      // publish/handover stay unavailable via the detail-plan blockers.
      return context.upgrade?.disposition === 'review-required'
        ? tctbpUpdateAvailable(context)
        : missingRemoteOrigin(context)
    }
    return workflowAction(context, 'publish', 'branch-unpublished')
  }
  if (observation.localTracking.state === 'ahead') {
    if (!observation.remoteOrigin) return missingRemoteOrigin(context)
    return workflowAction(context, 'publish', 'branch-ahead')
  }
  // The repository is otherwise healthy but its TCTBP managed surface is
  // behind the canonical source — surface that as an update recommendation
  // instead of claiming nothing needs doing.
  if (context.upgrade?.disposition === 'review-required') {
    return tctbpUpdateAvailable(context)
  }
  return noAction(context)
}

function applyIntent(
  context: EvaluationContext,
): ResultDefinition | null {
  if (context.intent !== 'continue-on-another-machine') return null
  if (!workflowAvailable(context.observation, 'handover')) {
    return unavailableWorkflow(context, 'handover')
  }
  return {
    disposition: 'action',
    primaryAction: 'handover',
    reasonCodes: ['handover-ready'],
    severity: 'action-recommended',
    actions: ['handover'],
    evidence: [
      intentEvidence(context),
      evidence(context, 'localTracking.state',
        context.observation.localTracking.state),
      evidence(context, 'workingTree.clean',
        context.observation.workingTree.clean),
    ],
  }
}

function workflowAction(
  context: EvaluationContext,
  action: 'checkpoint' | 'publish' | 'resume',
  reasonCode: RecommendationReasonCode,
  likelyNextActions: RecommendationAction[] = [],
): ResultDefinition {
  if (!workflowAvailable(context.observation, action)) {
    return unavailableWorkflow(context, action)
  }
  const field = action === 'checkpoint'
    ? 'workingTree.clean'
    : 'localTracking.state'
  const value = action === 'checkpoint'
    ? context.observation.workingTree.clean
    : context.observation.localTracking.state

  return {
    disposition: 'action',
    primaryAction: action,
    reasonCodes: [reasonCode],
    severity: 'action-recommended',
    actions: [action],
    likelyNextActions,
    blockedActions: action === 'checkpoint'
      ? block(['publish', 'resume'], [reasonCode])
      : block(
        action === 'resume' ? ['publish', 'handover'] : ['resume'],
        [reasonCode],
      ),
    evidence: [evidence(context, field, value)],
  }
}

function interruptedOperation(
  context: EvaluationContext,
): ResultDefinition {
  const hasConflicts = (
    context.observation.workingTree.counts.conflicted > 0
  )
  const reasonCodes: RecommendationReasonCode[] = [
    ...(context.observation.operations.length > 0
      ? ['active-git-operation' as const]
      : []),
    ...(hasConflicts ? ['index-conflicted' as const] : []),
  ]
  return {
    disposition: 'inspect',
    primaryAction: null,
    reasonCodes,
    severity: 'stop',
    actions: ['inspect-recovery', 'abort-dry-run'],
    blockedActions: block(BLOCKABLE_WORKFLOWS, reasonCodes),
    evidence: [
      evidence(context, 'operations', context.observation.operations),
      evidence(context, 'workingTree.counts.conflicted',
        context.observation.workingTree.counts.conflicted),
    ],
  }
}

function dirtyAndBehind(context: EvaluationContext): ResultDefinition {
  if (!workflowAvailable(context.observation, 'checkpoint')) {
    return unavailableWorkflow(context, 'checkpoint')
  }
  return {
    disposition: 'sequence',
    primaryAction: 'checkpoint',
    reasonCodes: ['working-tree-dirty-and-behind'],
    severity: 'stop',
    actions: ['checkpoint', 'inspect-recovery'],
    blockedActions: block(
      ['publish', 'resume', 'handover'],
      ['working-tree-dirty-and-behind'],
    ),
    likelyNextActions: ['inspect-recovery'],
    evidence: [
      evidence(context, 'workingTree.clean', false),
      evidence(context, 'localTracking.state', 'behind'),
    ],
  }
}

function staleDefinition(context: EvaluationContext): ResultDefinition {
  return {
    disposition: 'inspect',
    primaryAction: 'refresh-inspection',
    reasonCodes: ['inspection-required'],
    severity: 'attention',
    actions: ['refresh-inspection'],
    blockedActions: block(BLOCKABLE_WORKFLOWS, ['inspection-required']),
    evidence: [
      evidence(context, 'observedAt', context.observation.observedAt),
    ],
    uncertainties: [{
      code: 'observation-stale-or-invalid',
      message: 'Required local observation is stale or has an invalid time.',
    }],
  }
}

function tctbpMissing(context: EvaluationContext): ResultDefinition {
  return stoppingDefinition(
    context,
    'tctbp-not-installed',
    'install-tctbp',
    'tctbp.installed',
    false,
  )
}

function tctbpIncompatible(context: EvaluationContext): ResultDefinition {
  return stoppingDefinition(
    context,
    'tctbp-contract-incompatible',
    'review-compatibility',
    'tctbp.contract.major',
    context.observation.tctbp.contract.major,
  )
}

/**
 * An incompatible contract combined with uncommitted local work. The apply is
 * refused while the tree is dirty, so the first step is to preserve the work
 * with a checkpoint; the contract review follows once the tree is clean.
 * Note: checkpoint availability is not gated on the advertised workflow list
 * here — an incompatible contract advertises no workflows at all, yet the
 * checkpoint workflow itself runs regardless of contract compatibility.
 */
function incompatibleWithLocalChanges(
  context: EvaluationContext,
): ResultDefinition {
  return {
    disposition: 'sequence',
    primaryAction: 'checkpoint',
    reasonCodes: ['working-tree-dirty', 'tctbp-contract-incompatible'],
    severity: 'stop',
    actions: ['checkpoint', 'review-compatibility'],
    blockedActions: block(
      ['publish', 'resume', 'handover'],
      ['working-tree-dirty', 'tctbp-contract-incompatible'],
    ),
    likelyNextActions: ['review-compatibility'],
    evidence: [
      evidence(context, 'workingTree.clean', false),
      evidence(context, 'tctbp.compatible', false),
    ],
  }
}

function unbornRepository(context: EvaluationContext): ResultDefinition {
  return stoppingDefinition(
    context,
    'unborn-repository',
    'inspect-recovery',
    'head.unborn',
    true,
  )
}

function detachedHead(context: EvaluationContext): ResultDefinition {
  return stoppingDefinition(
    context,
    'detached-head',
    'reattach-branch',
    'head.detached',
    true,
  )
}

function divergedBranch(context: EvaluationContext): ResultDefinition {
  return stoppingDefinition(
    context,
    'branch-diverged',
    'inspect-recovery',
    'localTracking.state',
    'diverged',
  )
}

function unknownTracking(context: EvaluationContext): ResultDefinition {
  return {
    disposition: 'inspect',
    primaryAction: 'refresh-inspection',
    reasonCodes: ['inspection-required'],
    severity: 'attention',
    actions: ['refresh-inspection'],
    blockedActions: block(BLOCKABLE_WORKFLOWS, ['inspection-required']),
    evidence: [
      evidence(context, 'localTracking.state', 'unknown'),
    ],
    uncertainties: [{
      code: 'tracking-state-unavailable',
      message: 'Local tracking-reference state is unavailable.',
    }],
  }
}

function stoppingDefinition(
  context: EvaluationContext,
  reasonCode: RecommendationReasonCode,
  guidance: RecommendationAction,
  field: string,
  value: RecommendationEvidence['value'],
): ResultDefinition {
  return {
    disposition: 'stop',
    primaryAction: null,
    reasonCodes: [reasonCode],
    severity: 'stop',
    actions: [guidance],
    blockedActions: block(BLOCKABLE_WORKFLOWS, [reasonCode]),
    evidence: [evidence(context, field, value)],
  }
}

function unavailableWorkflow(
  context: EvaluationContext,
  action: RecommendationAction,
): ResultDefinition {  return {
    disposition: 'inspect',
    primaryAction: null,
    reasonCodes: ['inspection-required'],
    severity: 'attention',
    actions: ['review-compatibility'],
    blockedActions: block([action], ['inspection-required']),
    evidence: [
      evidence(context, 'tctbp.workflows',
        context.observation.tctbp.workflows),
    ],
    uncertainties: [{
      code: 'workflow-unavailable',
      message: `Required workflow '${action}' is not advertised.`,
    }],
  }
}

/**
 * No git remote 'origin' is configured, so publish (and handover, which also
 * publishes) can never succeed. Surface the missing remote instead of
 * offering an action that is guaranteed to fail at runtime.
 */
function missingRemoteOrigin(context: EvaluationContext): ResultDefinition {
  return {
    disposition: 'inspect',
    primaryAction: null,
    reasonCodes: ['remote-origin-missing'],
    severity: 'attention',
    actions: [],
    blockedActions: block(['publish', 'handover'], ['remote-origin-missing']),
    evidence: [
      evidence(context, 'remoteOrigin', context.observation.remoteOrigin),
      evidence(context, 'localTracking.state',
        context.observation.localTracking.state),
    ],
    uncertainties: [{
      code: 'remote-origin-missing',
      message: 'No git remote \'origin\' is configured, so nothing can be published.',
    }],
  }
}

function noAction(context: EvaluationContext): ResultDefinition {
  return {
    disposition: 'none',
    primaryAction: null,
    reasonCodes: ['no-action-required'],
    severity: 'healthy',
    evidence: [
      evidence(context, 'workingTree.clean', true),
      evidence(context, 'localTracking.state',
        context.observation.localTracking.state),
    ],
  }
}

/**
 * The repository is safe to operate (compatible contract, clean tree, in
 * sync) but its managed TCTBP surface is behind the canonical source. This is
 * a maintenance recommendation, not a safety stop — amber attention, with the
 * upgrade panel as the action surface.
 */
function tctbpUpdateAvailable(context: EvaluationContext): ResultDefinition {
  const counts = context.upgrade?.actionCounts
  const evidenceRows: RecommendationEvidence[] = [
    evidence(
      context,
      'upgrade.disposition',
      context.upgrade?.disposition ?? null,
    ),
  ]
  if ((counts?.add ?? 0) > 0) {
    evidenceRows.push(
      evidence(context, 'upgrade.actionCounts.add', counts?.add ?? 0),
    )
  }
  if ((counts?.review ?? 0) > 0) {
    evidenceRows.push(
      evidence(context, 'upgrade.actionCounts.review', counts?.review ?? 0),
    )
  }
  return {
    disposition: 'action',
    primaryAction: 'update-tctbp',
    reasonCodes: ['tctbp-update-available'],
    severity: 'attention',
    actions: ['update-tctbp'],
    evidence: evidenceRows,
  }
}

function evidence(
  context: EvaluationContext,
  field: string,
  value: RecommendationEvidence['value'],
): RecommendationEvidence {
  return {
    field,
    value,
    basis: context.observation.basis,
    observedAt: context.observation.observedAt,
  }
}

function intentEvidence(
  context: EvaluationContext,
): RecommendationEvidence {
  return {
    field: 'intent',
    value: context.intent,
    basis: 'user-input',
    observedAt: context.evaluatedAt.toISOString(),
  }
}

function block(
  actions: RecommendationAction[],
  reasonCodes: RecommendationReasonCode[],
): BlockedAction[] {
  return actions.map((action) => ({ action, reasonCodes }))
}

function workflowAvailable(
  observation: RepositoryObservation,
  action: RecommendationAction,
): boolean {
  return observation.tctbp.workflows.includes(action)
}
