import type { ActionerJob, ActionerWorkflowId } from '../../shared/actioner'
import type { IntentPlan } from '../../shared/intent'
import type {
  RecommendationAction,
  RecommendationReasonCode,
} from '../../shared/recommendation'
import { blockerHint, reasonLabel } from '../presentation'
import { Button, Panel } from './primitives'
import { Callout } from './Callout'

interface IntentPlanPanelProps {
  plan: IntentPlan | null
  actionJob: ActionerJob | null
  actionBusy: boolean
  inspectionBusy: boolean
  actionFeedback: string | null
  /**
   * The recommended action surfaced by the sticky Take action bar. When a
   * plan step resolves to the same workflow, the step button is omitted so
   * there is only ever one enabled button per action (owned by the bar).
   */
  primaryAction?: RecommendationAction | null
  /**
   * Reason codes behind the state-driven recommendation, shown inside each
   * step's explanation callout ("why this is recommended").
   */
  reasonCodes?: RecommendationReasonCode[]
  onRunAction: (workflowId: ActionerWorkflowId) => void
}

export function IntentPlanPanel({
  plan,
  actionJob,
  actionBusy,
  inspectionBusy,
  actionFeedback,
  primaryAction = null,
  reasonCodes = [],
  onRunAction,
}: IntentPlanPanelProps) {
  // No intent selected: hide the pane entirely instead of showing an empty
  // placeholder, so the page only displays relevant detail.
  if (!plan) {
    return null
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
          {plan.steps.map((step) => {
            // The Take action bar is the single action surface for the
            // recommended workflow; this step's button stands down when the
            // bar already owns the same action.
            const ownedByBar = primaryAction === actionWorkflowForStep(step)
            return (
              <li
                key={step.id}
                className="flex items-start gap-4 p-4 bg-surface-soft border border-border rounded-lg"
              >
                <StepIndicator condition={step.condition} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <strong className="text-text-primary">{step.label}</strong>
                    <span className="flex items-center gap-2">
                      <ConditionBadge condition={step.condition} />
                      {isActionableStep(step) && (
                        <Callout label={`Why ${step.label}`}>
                          <ExplanationCallout
                            plan={plan}
                            reasonCodes={reasonCodes}
                          />
                        </Callout>
                      )}
                    </span>
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
                    && !ownedByBar
                    && !(actionJob?.workflowId === 'handover' && actionJob.status === 'completed') && (
                    <Button
                      className="mt-3"
                      size="sm"
                      disabled={
                        inspectionBusy
                        || actionBusy
                        || Boolean(actionJob && ['queued', 'running'].includes(actionJob.status))
                      }
                      onClick={() => onRunAction(actionWorkflowForStep(step))}
                    >
                      {actionBusy ? 'Starting…' : actionLabelForStep(step)}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
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
    || step.workflowId === 'promote'
    || step.workflowId === 'ship'
}

function actionWorkflowForStep(step: IntentPlan['steps'][number]): ActionerWorkflowId {
  if (step.workflowId === 'branch') return 'branch-development'
  if (step.workflowId === 'handover') return 'handover'
  if (step.workflowId === 'resume') return 'resume'
  if (step.workflowId === 'deploy') return 'deploy-development'
  if (step.workflowId === 'promote' && step.targetBranch === 'production') return 'promote-production'
  if (step.workflowId === 'promote') return 'promote-review'
  if (step.workflowId === 'ship') return 'ship'
  return step.workflowId as 'checkpoint' | 'publish'
}

function actionLabelForStep(step: IntentPlan['steps'][number]): string {
  // Promote steps carry the resolved branch name in their label (e.g.
  // "Promote staging" or "Promote review"), so prefer it over the workflow's
  // generic label.
  if (step.workflowId === 'promote') return step.label
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
    'add-origin': 'Add origin',
    'create-origin': 'Create on GitHub',
  }
  return labels[actionWorkflowForStep(step)]
}

function ExplanationCallout({
  plan,
  reasonCodes,
}: {
  plan: IntentPlan
  reasonCodes: RecommendationReasonCode[]
}) {
  const hasContent = reasonCodes.length > 0
    || plan.effects.does.length > 0
    || plan.effects.doesNot.length > 0
  if (!hasContent) {
    return <p className="text-sm text-text-secondary">No additional detail.</p>
  }
  return (
    <div className="space-y-3">
      {reasonCodes.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Why</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {reasonCodes.map((reason) => (
              <li
                className="px-2 py-1 text-xs rounded-full bg-surface-inset border border-border text-text-secondary"
                key={reason}
              >
                {reasonLabel(reason)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.effects.does.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
            What this action does
          </p>
          <ul className="mt-1 space-y-1 text-sm text-text-secondary list-disc list-inside">
            {plan.effects.does.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {plan.effects.doesNot.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
            What this action does not do
          </p>
          <ul className="mt-1 space-y-1 text-sm text-text-secondary list-disc list-inside">
            {plan.effects.doesNot.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
