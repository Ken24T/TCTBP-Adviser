// TCTBP file-size justification: this module holds the eight intent-plan
// builders (one per RecommendationIntent) plus the preservation/safety
// helpers they all share. Shared step/block primitives already live in
// plan-helpers.ts; the builders stay together because they share PlanContext
// and the same plan shape.
import type { RepositoryObservation } from '../../shared/inspection'
import type { DeploymentEvidence } from '../../shared/deployment'
import type { HandoverEvidence } from '../../shared/handover'
import type {
  IntentPlan,
  IntentPlanBlock,
  IntentPlanStep,
} from '../../shared/intent'
import type {
  RecommendationIntent,
  RecommendationResult,
} from '../../shared/recommendation'
import {
  blockedPlan,
  branchStep,
  completePlan,
  deployStep,
  guidanceStep,
  promoteStep,
  readyPlan,
  statusStep,
  workflowStep,
  type PlanContext,
} from './plan-helpers'

export function planIntent(
  observation: RepositoryObservation,
  state: RecommendationResult,
  intent: RecommendationIntent,
  deploymentEvidence: DeploymentEvidence | null = null,
  handoverEvidence: HandoverEvidence | null = null,
): IntentPlan | null {
  if (intent === 'none') return null
  const context = { observation, state, intent, deploymentEvidence, handoverEvidence }
  if (intent === 'recover-interrupted-workflow') {
    return recoveryPlan(context)
  }
  const blockers = safetyBlocks(state)
  if (blockers.length > 0) return blockedPlan(context, blockers)

  if (intent === 'preserve-locally') return preserveLocally(context)
  if (intent === 'preserve-and-publish') return preserveAndPublish(context)
  if (intent === 'continue-on-another-machine') return handover(context)
  if (intent === 'resume-after-machine-change') return resume(context)
  if (intent === 'prepare-pre-production') return preparePreProduction(context)
  if (intent === 'deploy-current-environment') return deployCurrent(context)
  return productionRelease(context)
}

function preserveLocally(context: PlanContext): IntentPlan {
  if (context.observation.workingTree.clean) {
    return completePlan(
      context,
      'Work is already preserved locally',
      'The working tree is clean, so no checkpoint is required.',
    )
  }
  return readyPlan(
    context,
    'Preserve current work locally',
    'Create one local checkpoint without publishing or promoting it.',
    [workflowStep(
      'checkpoint',
      'Checkpoint',
      'checkpoint please',
      'required',
      'Preserves tracked and untracked work in a local commit.',
    )],
  )
}

function preserveAndPublish(context: PlanContext): IntentPlan {
  const { observation } = context
  if (!observation.remoteOrigin) {
    return blockedPlan(context, [{
      code: 'remote-origin-missing',
      message: 'No remote origin is configured, so nothing can be published.',
    }], [statusStep()])
  }
  const steps = [statusStep()]
  if (!observation.workingTree.clean) {
    steps.push(workflowStep(
      'checkpoint',
      'Checkpoint',
      'checkpoint please',
      'required',
      'Preserve uncommitted work before publishing.',
    ))
  }
  if (observation.localTracking.state === 'behind') {
    steps.push(workflowStep(
      'resume',
      'Resume',
      'resume please',
      'required',
      'Reconcile the clean behind branch before publication.',
    ))
    steps.push(workflowStep(
      'publish-after-resume',
      'Publish if reconciliation creates local commits',
      'publish please',
      'conditional',
      'Publish only if a fresh inspection reports an ahead branch.',
      'publish',
    ))
  } else if (
    !observation.workingTree.clean
    || observation.localTracking.state === 'ahead'
    || observation.localTracking.state === 'unpublished'
  ) {
    steps.push(workflowStep(
      'publish',
      'Publish',
      'publish please',
      'required',
      'Publish the current branch after local work is preserved.',
    ))
  }
  if (steps.length === 1) {
    return completePlan(
      context,
      'Current work is already preserved and published',
      'The working tree is clean and the branch is in sync.',
      steps,
    )
  }
  return readyPlan(
    context,
    'Preserve and publish current work',
    'The sequence adapts to dirty, ahead, unpublished and behind state.',
    steps,
  )
}

function handover(context: PlanContext): IntentPlan {
  if (!context.observation.remoteOrigin) {
    return blockedPlan(context, [{
      code: 'remote-origin-missing',
      message: 'No remote origin is configured, so a handover cannot publish its continuation baseline.',
    }], [statusStep()])
  }
  if (
    context.handoverEvidence?.workflowCompleted === true
    && context.handoverEvidence.branch === context.observation.head.branch
    && context.handoverEvidence.commitSha === context.observation.head.sha
  ) {
    return completePlan(
      context,
      'Handover already completed for this commit',
      context.handoverEvidence.summary,
      [statusStep()],
    )
  }
  const steps: IntentPlanStep[] = []
  if (context.observation.localTracking.state === 'behind') {
    steps.push(workflowStep(
      'resume',
      'Resume',
      'resume please',
      'required',
      'Reconcile the behind branch before transferring machines.',
    ))
  }
  steps.push(workflowStep(
    'handover',
    'Handover',
    'handover please',
    'required',
    'Preserves, records continuation context and publishes in one workflow.',
  ))
  return readyPlan(
    context,
    'Continue on another machine',
    'Handover is preferred over manually composing checkpoint and publish.',
    steps,
  )
}

function resume(context: PlanContext): IntentPlan {
  const { observation } = context
  if (!observation.workingTree.clean) {
    return blockedPlan(context, [{
      code: 'resume-requires-clean-tree',
      message: 'Resume requires a clean working tree.',
    }])
  }
  if (observation.localTracking.state !== 'behind') {
    return completePlan(
      context,
      'No machine-change reconciliation is required',
      'The current branch is not behind its local tracking ref.',
    )
  }
  return readyPlan(
    context,
    'Resume work after changing machines',
    'Reconcile the clean local branch with its tracking evidence.',
    [workflowStep(
      'resume',
      'Resume',
      'resume please',
      'required',
      'Restores a safe local baseline after changing machines.',
    )],
  )
}

function preparePreProduction(context: PlanContext): IntentPlan {
  const model = context.observation.tctbp.branchModel
  if (!model.workingBranch || !model.preProductionBranch) {
    return blockedPlan(context, [{
      code: 'pre-production-branch-unavailable',
      message: 'The selected branch strategy has no pre-production branch.',
    }])
  }
  const current = context.observation.head.branch
  if (current === model.preProductionBranch) {
    return completePlan(
      context,
      'Work is already on the pre-production branch',
      `The likely next action is to deploy ${model.preProductionBranch}.`,
      [deployStep(model.preProductionBranch, 'conditional')],
    )
  }
  if (current !== model.workingBranch) {
    return blockedPlan(context, [{
      code: 'promotion-source-branch-mismatch',
      message: `Promotion must start from ${model.workingBranch}.`,
    }])
  }
  const steps = preservationPrerequisites(context.observation)
  steps.push(promoteStep(model.preProductionBranch, 'required'))
  steps.push(deployStep(model.preProductionBranch, 'conditional'))
  return readyPlan(
    context,
    `Prepare ${model.preProductionBranch}`,
    'Preserve and publish first when required, then promote explicitly.',
    steps,
  )
}

function deployCurrent(context: PlanContext): IntentPlan {
  const { observation } = context
  const model = observation.tctbp.branchModel
  const branch = observation.head.branch
  const target = branch === model.productionBranch
    ? 'production'
    : branch === model.preProductionBranch
      ? 'staging'
      : branch === model.workingBranch
        ? 'dev'
        : null
  if (!target) {
    const workingBranch = model.workingBranch
    const activationSteps = workingBranch && branch !== workingBranch
      ? [
        branchStep(
          workingBranch,
          `Create or switch to the configured working branch '${workingBranch}' before deployment.`,
        ),
        workflowStep(
          'publish-working-branch',
          'Publish working branch',
          'publish please',
          'required',
          `Publish '${workingBranch}' so the deployment workflow has branch-backed continuity.`,
          'publish',
          workingBranch,
        ),
        deployStep('dev', 'conditional'),
      ]
      : []
    return blockedPlan(context, [{
      code: 'deployment-branch-unmapped',
      message: workingBranch
        ? `The current branch '${branch ?? 'unknown'}' has no environment role. Activate '${workingBranch}' before deploying development.`
        : 'The current branch has no configured environment role.',
    }], activationSteps)
  }
  if (
    target === 'dev'
    && context.deploymentEvidence?.workflowCompleted === true
    && context.deploymentEvidence.branch === branch
    && context.deploymentEvidence.commitSha === observation.head.sha
  ) {
    return completePlan(
      context,
      'Development deployment already completed for this commit',
      context.deploymentEvidence.summary,
      [statusStep()],
    )
  }
  const steps = preservationPrerequisites(observation)
  steps.push(deployStep(target, 'required'))
  return readyPlan(
    context,
    `Deploy the ${target} environment`,
    `Deployment advice follows the ${model.strategy ?? 'unknown'} branch strategy.`,
    steps,
  )
}

function productionRelease(context: PlanContext): IntentPlan {
  const { observation } = context
  const model = observation.tctbp.branchModel
  const branch = observation.head.branch
  const steps = preservationPrerequisites(observation)

  if (model.preProductionBranch && branch === model.workingBranch) {
    steps.push(promoteStep(model.preProductionBranch, 'required'))
    steps.push(deployStep('staging', 'conditional'))
    steps.push(promoteStep('production', 'conditional'))
  } else if (
    model.preProductionBranch
    && branch === model.preProductionBranch
  ) {
    steps.push(promoteStep('production', 'required'))
  } else if (branch !== model.productionBranch) {
    return blockedPlan(context, [{
      code: 'production-path-unavailable',
      message: 'The current branch is outside the configured release path.',
    }])
  }
  steps.push(workflowStep(
    'ship',
    'Ship',
    'ship please',
    steps.length > 0 ? 'conditional' : 'required',
    'Runs release gates, versions and publishes the release.',
  ))
  steps.push(deployStep('production', 'conditional'))
  return readyPlan(
    context,
    'Prepare a production release',
    'Promotion, shipping and deployment remain explicit gated workflows.',
    steps,
  )
}

function recoveryPlan(context: PlanContext): IntentPlan {
  const interrupted = (
    context.observation.operations.length > 0
    || context.observation.workingTree.counts.conflicted > 0
  )
  if (!interrupted) {
    return completePlan(
      context,
      'No interrupted workflow is visible',
      'No active Git operation or index conflict requires recovery.',
    )
  }
  return readyPlan(
    context,
    'Inspect interrupted workflow recovery',
    'Inspect first; no recovery mutation is performed by the Adviser.',
    [
      guidanceStep(
        'inspect-recovery',
        'Inspect recovery evidence',
        'Review active operation and conflict evidence.',
      ),
      workflowStep(
        'abort',
        'Inspect abort options',
        'abort',
        'conditional',
        'Runs only the TCTBP abort dry-run before any recovery decision.',
      ),
    ],
  )
}

function preservationPrerequisites(
  observation: RepositoryObservation,
): IntentPlanStep[] {
  const steps: IntentPlanStep[] = []
  if (!observation.workingTree.clean) {
    steps.push(workflowStep(
      'checkpoint',
      'Checkpoint',
      'checkpoint please',
      'required',
      'Preserve local changes before environment workflows.',
    ))
  }
  if (
    !observation.workingTree.clean
    || observation.localTracking.state === 'ahead'
    || observation.localTracking.state === 'unpublished'
  ) {
    steps.push(workflowStep(
      'publish',
      'Publish',
      'publish please',
      'required',
      'Publish the source branch before promotion or deployment.',
    ))
  } else if (observation.localTracking.state === 'behind') {
    steps.push(workflowStep(
      'resume',
      'Resume',
      'resume please',
      'required',
      'Reconcile the behind branch before environment workflows.',
    ))
  }
  return steps
}

function safetyBlocks(state: RecommendationResult): IntentPlanBlock[] {
  const blockingCodes = new Set([
    'active-git-operation',
    'index-conflicted',
    'detached-head',
    'unborn-repository',
    'branch-diverged',
    'working-tree-dirty-and-behind',
    'tctbp-not-installed',
    'tctbp-contract-incompatible',
    'inspection-required',
  ])
  return state.reasonCodes.filter((code) => blockingCodes.has(code)).map(
    (code) => ({
      code,
      message: `Resolve the state-driven '${code}' condition first.`,
    }),
  )
}
