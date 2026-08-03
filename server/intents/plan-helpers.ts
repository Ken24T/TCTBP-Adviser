import { createHash } from 'node:crypto'
import type { RepositoryObservation } from '../../shared/inspection'
import type {
  IntentPlan,
  IntentPlanBlock,
  IntentPlanStep,
  IntentWorkflowId,
} from '../../shared/intent'
import type {
  RecommendationIntent,
  RecommendationResult,
} from '../../shared/recommendation'

type SelectedIntent = Exclude<RecommendationIntent, 'none'>

export interface PlanContext {
  observation: RepositoryObservation
  state: RecommendationResult
  intent: SelectedIntent
}

export function readyPlan(
  context: PlanContext,
  title: string,
  summary: string,
  steps: IntentPlanStep[],
): IntentPlan {
  const missing = missingWorkflowBlocks(context.observation, steps)
  if (missing.length > 0) return blockedPlan(context, missing, steps)
  return createPlan(context, 'ready', title, summary, steps, [])
}

export function completePlan(
  context: PlanContext,
  title: string,
  summary: string,
  steps: IntentPlanStep[] = [],
): IntentPlan {
  const missing = missingWorkflowBlocks(context.observation, steps)
  if (missing.length > 0) return blockedPlan(context, missing, steps)
  return createPlan(context, 'complete', title, summary, steps, [])
}

export function blockedPlan(
  context: PlanContext,
  blockedBy: IntentPlanBlock[],
  steps: IntentPlanStep[] = [],
): IntentPlan {
  return createPlan(
    context,
    'blocked',
    'Intent is blocked by repository state or policy',
    'Follow the state-driven recommendation before this intent.',
    steps,
    blockedBy,
  )
}

export function statusStep(): IntentPlanStep {
  return {
    id: 'status',
    workflowId: 'status',
    label: 'Review current status',
    trigger: 'status please',
    kind: 'inspection',
    condition: 'satisfied',
    targetBranch: null,
    explanation: 'The Adviser has already collected the current observation.',
  }
}

export function branchStep(target: string, explanation: string): IntentPlanStep {
  return workflowStep(
    `branch-${target}`,
    `Create ${target} branch`,
    `branch ${target} please`,
    'required',
    explanation,
    'branch',
    target,
  )
}

export function promoteStep(
  target: string,
  condition: IntentPlanStep['condition'],
): IntentPlanStep {
  return workflowStep(
    `promote-${target}`,
    `Promote ${target}`,
    `promote ${target} please`,
    condition,
    `Explicitly promotes into the ${target} role.`,
    'promote',
    target,
  )
}

export function deployStep(
  target: string,
  condition: IntentPlanStep['condition'],
): IntentPlanStep {
  const cliTarget = target === 'production' ? 'production' : (
    target === 'dev' ? 'dev' : 'staging'
  )
  return workflowStep(
    `deploy-${target}`,
    `Deploy ${target}`,
    `deploy ${cliTarget} please`,
    condition,
    `Deploys the ${target} environment after its gates pass.`,
    'deploy',
    target,
  )
}

export function workflowStep(
  id: string,
  label: string,
  trigger: string,
  condition: IntentPlanStep['condition'],
  explanation: string,
  workflowId: IntentWorkflowId = id as IntentWorkflowId,
  targetBranch: string | null = null,
): IntentPlanStep {
  return {
    id,
    workflowId,
    label,
    trigger,
    kind: 'workflow',
    condition,
    targetBranch,
    explanation,
  }
}

export function guidanceStep(
  id: string,
  label: string,
  explanation: string,
): IntentPlanStep {
  return {
    id,
    workflowId: 'inspect-recovery',
    label,
    trigger: null,
    kind: 'guidance',
    condition: 'required',
    targetBranch: null,
    explanation,
  }
}

function createPlan(
  context: PlanContext,
  status: IntentPlan['status'],
  title: string,
  summary: string,
  steps: IntentPlanStep[],
  blockedBy: IntentPlanBlock[],
): IntentPlan {
  const likely = steps.find((step) => step.condition === 'required') ?? null
  const plan = {
    source: 'user-intent' as const,
    intent: context.intent,
    status,
    title,
    summary,
    steps,
    likelyNextStepId: likely?.id ?? null,
    blockedBy,
    evidence: [{
      field: 'intent',
      value: context.intent,
      basis: 'user-input',
      observedAt: context.state.freshness.evaluatedAt,
    }],
    branchStrategy: context.observation.tctbp.branchModel.strategy,
    effects: planEffects(steps),
  }
  const fingerprintBasis = {
    ...plan,
    evidence: plan.evidence.map((evidence) => ({
      field: evidence.field,
      value: evidence.value,
      basis: evidence.basis,
    })),
  }
  return {
    ...plan,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(fingerprintBasis))
      .digest('hex'),
  }
}

function missingWorkflowBlocks(
  observation: RepositoryObservation,
  steps: IntentPlanStep[],
): IntentPlanBlock[] {
  const advertised = new Set(observation.tctbp.workflows)
  return Array.from(new Set(steps.filter(
    (step) => step.kind === 'workflow' && !advertised.has(step.workflowId),
  ).map((step) => step.workflowId))).map((workflowId) => ({
    code: 'workflow-unavailable',
    message: `TCTBP does not advertise the '${workflowId}' workflow.`,
  }))
}

function planEffects(steps: IntentPlanStep[]): IntentPlan['effects'] {
  const workflows = new Set(steps.map((step) => step.workflowId))
  const does: string[] = []
  if (workflows.has('checkpoint')) does.push('Preserves local work.')
  if (workflows.has('publish') || workflows.has('handover')) {
    does.push('Publishes the current work branch when safe.')
  }
  if (workflows.has('promote')) does.push('Promotes between configured roles.')
  if (workflows.has('deploy')) does.push('Deploys an explicit environment.')
  if (workflows.has('ship')) does.push('Runs the explicit release workflow.')
  return {
    does,
    doesNot: [
      'The Adviser does not execute any displayed workflow.',
      'Conditional steps still require a fresh inspection and TCTBP guardrails.',
    ],
  }
}
