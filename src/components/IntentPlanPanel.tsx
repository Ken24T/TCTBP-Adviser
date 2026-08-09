import type { ActionerJob, ActionerWorkflowId } from '../../shared/actioner'
import type { IntentPlan } from '../../shared/intent'
import { blockerHint } from '../presentation'
import { Button, Panel } from './primitives'

interface IntentPlanPanelProps {
  plan: IntentPlan | null
  actionJob: ActionerJob | null
  actionBusy: boolean
  inspectionBusy: boolean
  actionFeedback: string | null
  onRunAction: (workflowId: ActionerWorkflowId) => void
}

export function IntentPlanPanel({
  plan,
  actionJob,
  actionBusy,
  inspectionBusy,
  actionFeedback,
  onRunAction,
}: IntentPlanPanelProps) {
  if (!plan) {
    return (
      <Panel eyebrow="Intent-driven plan" title="No additional intent selected">
        <p className="text-text-secondary leading-relaxed">
          The state-driven recommendation above is based only on repository
          evidence. Select an outcome to see a conditional workflow sequence.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      eyebrow={`Intent-driven plan · ${plan.status}`}
      title={plan.title}
    >
      <p className="text-text-secondary mb-4">{plan.summary}</p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-bold uppercase tracking-widest text-text-muted">Branch strategy</span>
        <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-surface-soft text-text-primary border border-border">
          {plan.branchStrategy ?? 'Unknown branch strategy'}
        </span>
      </div>

      {actionFeedback && (
        <p className="mt-4 p-4 text-sm bg-surface-soft border border-border rounded-lg text-text-secondary">
          {actionFeedback}
        </p>
      )}

      {plan.blockedBy.length > 0 && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <strong className="block text-sm font-semibold text-red-900 mb-1">Resolve state or policy first</strong>
          <ul className="space-y-2 text-sm text-red-800">
            {plan.blockedBy.map((block) => (
              <li key={`${block.code}-${block.message}`}>
                <p>{block.message}</p>
                {blockerHint(block.code) && (
                  <p className="mt-0.5 text-xs text-red-700">How to resolve: {blockerHint(block.code)}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.steps.length > 0 && (
        <ol className="mt-4 space-y-3">
          {plan.steps.map((step) => (
            <li
              key={step.id}
              className="flex items-start gap-4 p-4 bg-surface-soft border border-border rounded-lg"
            >
              <StepIndicator condition={step.condition} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <strong className="text-text-primary">{step.label}</strong>
                  <ConditionBadge condition={step.condition} />
                </div>
                <p className="mt-1 text-sm text-text-secondary">{step.explanation}</p>
                {step.trigger && (
                  <code className="mt-2 inline-block px-2 py-1 text-xs bg-surface-inset rounded text-text-primary">
                    {step.trigger}
                  </code>
                )}
                {isActionableStep(step)
                  && step.condition === 'required'
                  && plan.fingerprint
                  && !(actionJob?.workflowId === 'handover' && actionJob.status === 'completed') && (
                  <Button
                    className="mt-3"
                    size="sm"
                    disabled={inspectionBusy || actionBusy || Boolean(actionJob && ['queued', 'running'].includes(actionJob.status))}
                    onClick={() => onRunAction(actionWorkflowForStep(step))}
                  >
                    {actionBusy ? 'Starting…' : actionLabelForStep(step)}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {plan.likelyNextStepId && (
        <div className="mt-4 p-4 border border-dashed border-border rounded-lg flex items-center gap-2 text-sm">
          <span className="text-text-muted">Likely next action</span>
          <strong className="text-text-primary">{stepLabel(plan, plan.likelyNextStepId)}</strong>
        </div>
      )}

      <p className="mt-4 text-xs text-text-faint">
        This is policy-grounded guidance only. Nothing displayed here is
        executed by the Adviser.
      </p>
    </Panel>
  )
}

function StepIndicator({ condition }: { condition: IntentPlan['steps'][number]['condition'] }) {
  const classes = condition === 'satisfied'
    ? 'bg-teal-100 text-teal-700 border-teal-200'
    : condition === 'conditional'
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-ink-100 text-text-primary border-border'

  const icon = condition === 'satisfied' ? '✓'
    : condition === 'conditional' ? '?'
    : '●'

  return (
    <span className={`shrink-0 grid w-8 h-8 text-sm font-bold place-items-center rounded-full border ${classes}`}>
      {icon}
    </span>
  )
}

function ConditionBadge({ condition }: { condition: IntentPlan['steps'][number]['condition'] }) {
  const tone = condition === 'satisfied' ? 'success'
    : condition === 'conditional' ? 'warning'
    : 'info'
  const label = condition === 'satisfied' ? 'Already satisfied'
    : condition === 'conditional' ? 'Conditional'
    : 'Required'

  const toneClasses = {
    success: 'bg-teal-100 text-teal-800',
    warning: 'bg-amber-100 text-amber-800',
    info: 'bg-blue-100 text-blue-800',
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${toneClasses[tone]}`}>
      {label}
    </span>
  )
}

function conditionLabel(
  condition: IntentPlan['steps'][number]['condition'],
): string {
  if (condition === 'satisfied') return 'Already satisfied'
  if (condition === 'conditional') return 'Conditional'
  return 'Required'
}

function stepLabel(plan: IntentPlan, id: string): string {
  return plan.steps.find((step) => step.id === id)?.label ?? id
}

function isActionableStep(step: IntentPlan['steps'][number]): boolean {
  return step.workflowId === 'checkpoint'
    || step.workflowId === 'publish'
    || (step.workflowId === 'branch' && step.targetBranch === 'development')
    || step.workflowId === 'handover'
    || step.workflowId === 'resume'
    || (step.workflowId === 'deploy' && step.targetBranch === 'dev')
    || (step.workflowId === 'promote' && (step.targetBranch === 'review' || step.targetBranch === 'production'))
    || step.workflowId === 'ship'
}

function actionWorkflowForStep(step: IntentPlan['steps'][number]): ActionerWorkflowId {
  if (step.workflowId === 'branch') return 'branch-development'
  if (step.workflowId === 'handover') return 'handover'
  if (step.workflowId === 'resume') return 'resume'
  if (step.workflowId === 'deploy') return 'deploy-development'
  if (step.workflowId === 'promote' && step.targetBranch === 'review') return 'promote-review'
  if (step.workflowId === 'promote' && step.targetBranch === 'production') return 'promote-production'
  if (step.workflowId === 'ship') return 'ship'
  return step.workflowId as 'checkpoint' | 'publish'
}

function actionLabelForStep(step: IntentPlan['steps'][number]): string {
  const labels: Record<ActionerWorkflowId, string> = {
    checkpoint: 'Run checkpoint',
    publish: 'Publish branch',
    'branch-development': 'Branch development',
    'deploy-development': 'Deploy development',
    'repair-tctbp-script-compatibility': 'Repair TCTBP scripts',
    handover: 'Run handover',
    resume: 'Run resume',
    'promote-review': 'Promote review',
    'promote-production': 'Promote production',
    ship: 'Ship release',
  }
  return labels[actionWorkflowForStep(step)]
}
