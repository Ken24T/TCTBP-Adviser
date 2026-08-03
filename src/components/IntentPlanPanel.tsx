import type { ActionerJob, ActionerWorkflowId } from '../../shared/actioner'
import type { IntentPlan } from '../../shared/intent'
import { ActionerProgress } from './ActionerProgress'

interface IntentPlanPanelProps {
  plan: IntentPlan | null
  actionJob: ActionerJob | null
  actionBusy: boolean
  inspectionBusy: boolean
  actionFeedback: string | null
  onRunAction: (workflowId: ActionerWorkflowId) => void
  onRepairCompatibility: () => void
}

export function IntentPlanPanel({
  plan,
  actionJob,
  actionBusy,
  inspectionBusy,
  actionFeedback,
  onRunAction,
  onRepairCompatibility,
}: IntentPlanPanelProps) {
  if (!plan) {
    return (
      <section className="intent-plan intent-plan-empty">
        <p className="eyebrow">Intent-driven plan</p>
        <h2>No additional intent selected</h2>
        <p>
          The state-driven recommendation above is based only on repository
          evidence. Select an outcome to see a conditional workflow sequence.
        </p>
      </section>
    )
  }

  return (
    <section
      className={`intent-plan intent-plan-${plan.status}`}
      aria-labelledby="intent-plan-title"
    >
      <div className="intent-plan-heading">
        <div>
          <p className="eyebrow">Intent-driven plan · {plan.status}</p>
          <h2 id="intent-plan-title">{plan.title}</h2>
          <p>{plan.summary}</p>
        </div>
        <span>{plan.branchStrategy ?? 'Unknown branch strategy'}</span>
      </div>

      {actionJob && (
        <ActionerProgress
          job={actionJob}
          onRepairCompatibility={onRepairCompatibility}
        />
      )}
      {actionFeedback && <p className="empty-state">{actionFeedback}</p>}

      {plan.blockedBy.length > 0 && (
        <div className="intent-blocks">
          <strong>Resolve state or policy first</strong>
          <ul>
            {plan.blockedBy.map((block) => (
              <li key={`${block.code}-${block.message}`}>{block.message}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.steps.length > 0 && (
        <ol className="intent-sequence">
          {plan.steps.map((step) => (
            <li
              className={`intent-step intent-step-${step.condition}`}
              key={step.id}
            >
              <span className="intent-step-number" aria-hidden="true" />
              <div>
                <div className="intent-step-heading">
                  <strong>{step.label}</strong>
                  <small>{conditionLabel(step.condition)}</small>
                </div>
                <p>{step.explanation}</p>
                {step.trigger && <code>{step.trigger}</code>}
                {(step.workflowId === 'checkpoint'
                  || step.workflowId === 'publish'
                  || (step.workflowId === 'branch' && step.targetBranch === 'development')
                  || step.workflowId === 'handover'
                  || (step.workflowId === 'deploy' && step.targetBranch === 'dev'))
                  && step.condition === 'required'
                  && plan.fingerprint && (
                  <button
                    className="intent-action-button"
                    disabled={inspectionBusy || actionBusy || Boolean(actionJob && ['queued', 'running'].includes(actionJob.status))}
                    type="button"
                    onClick={() => onRunAction(
                      step.workflowId === 'branch'
                        ? 'branch-development'
                        : step.workflowId === 'handover'
                          ? 'handover'
                          : step.workflowId === 'deploy'
                            ? 'deploy-development'
                            : step.workflowId as 'checkpoint' | 'publish',
                    )}
                  >
                    {actionBusy
                      ? 'Starting…'
                      : step.workflowId === 'checkpoint'
                        ? 'Run checkpoint'
                        : step.workflowId === 'publish'
                          ? 'Publish branch'
                          : step.workflowId === 'branch'
                            ? 'Branch development'
                            : step.workflowId === 'handover'
                              ? 'Run handover'
                              : 'Deploy development'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {plan.likelyNextStepId && (
        <div className="likely-next">
          <span>Likely next action</span>
          <strong>{stepLabel(plan, plan.likelyNextStepId)}</strong>
        </div>
      )}

      <p className="intent-boundary">
        This is policy-grounded guidance only. Nothing displayed here is
        executed by the Adviser.
      </p>
    </section>
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
