import type { ActionerIntent } from '../shared/actioner'
import type { RepositoryObservation } from '../shared/inspection'
import { AdviserError } from './errors'
import { planIntent } from './intents/planner'
import { recommend } from './recommendations/engine'

export function assertCheckpointPlan(
  observation: RepositoryObservation,
  planFingerprint: string,
  intent: ActionerIntent,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    intent,
  )
  const checkpointStep = plan?.steps.find((step) => step.workflowId === 'checkpoint')
  if (
    !plan
    || plan.fingerprint !== planFingerprint
    || plan.status !== 'ready'
    || checkpointStep?.condition !== 'required'
  ) {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The checkpoint plan is stale, blocked, or no longer required.',
    )
  }
}

export function assertPublishPlan(
  observation: RepositoryObservation,
  planFingerprint: string,
  intent: ActionerIntent,
): void {
  // Publish can be required inside several intent plans (preserve-and-publish,
  // prepare-production-release, …). Rebuild the plan for the intent the client
  // actually acted on, so the fingerprint handshake matches the plan the user
  // approved — not a hardcoded preserve-and-publish plan.
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    intent,
  )
  const publishStep = plan?.steps.find((step) => step.workflowId === 'publish')
  if (
    !plan
    || plan.fingerprint !== planFingerprint
    || plan.status !== 'ready'
    || publishStep?.condition !== 'required'
  ) {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The publish plan is stale, blocked, or no longer required.',
    )
  }
}

export function assertResumePlan(
  observation: RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'resume-after-machine-change',
  )
  const resumeStep = plan?.steps.find((step) => step.workflowId === 'resume')
  if (!plan || plan.fingerprint !== planFingerprint || plan.status !== 'ready' || resumeStep?.condition !== 'required') {
    throw new AdviserError('actioner-plan-stale-or-blocked', 'The resume plan is stale or blocked.')
  }
}

export function assertHandoverPlan(
  observation: RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'continue-on-another-machine',
  )
  const handoverStep = plan?.steps.find((step) => step.workflowId === 'handover')
  if (!plan || plan.fingerprint !== planFingerprint || plan.status !== 'ready' || handoverStep?.condition !== 'required') {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The handover plan is stale or blocked.',
    )
  }
}

export function assertDeployDevelopmentPlan(
  observation: RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'deploy-current-environment',
  )
  const deployStep = plan?.steps.find((step) => step.workflowId === 'deploy')
  if (
    !plan
    || plan.fingerprint !== planFingerprint
    || plan.status !== 'ready'
    || deployStep?.condition !== 'required'
    || deployStep.targetBranch !== 'dev'
  ) {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The development deployment plan is stale, blocked, or not currently required.',
    )
  }
}

export function assertBranchDevelopmentPlan(
  observation: RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'deploy-current-environment',
  )
  const branchStep = plan?.steps.find(
    (step) => step.workflowId === 'branch' && step.targetBranch === 'development',
  )
  if (!plan || plan.fingerprint !== planFingerprint || !branchStep || branchStep.condition !== 'required') {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The development branch activation plan is stale or blocked.',
    )
  }
}

export function assertPromotePlan(
  observation: RepositoryObservation,
  planFingerprint: string,
  targetBranch: string,
  intent: ActionerIntent,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    intent,
  )
  const promoteStep = plan?.steps.find(
    (step) => step.workflowId === 'promote' && step.targetBranch === targetBranch,
  )
  if (
    !plan
    || plan.fingerprint !== planFingerprint
    || plan.status !== 'ready'
    || !promoteStep
    || promoteStep.condition !== 'required'
  ) {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      `The promote ${targetBranch} plan is stale, blocked, or not currently required.`,
    )
  }
}

export function assertShipPlan(
  observation: RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'prepare-production-release',
  )
  const shipStep = plan?.steps.find(
    (step) => step.workflowId === 'ship',
  )
  if (
    !plan
    || plan.fingerprint !== planFingerprint
    || plan.status !== 'ready'
    || !shipStep
    || shipStep.condition !== 'required'
  ) {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The ship plan is stale, blocked, or not currently required.',
    )
  }
}
