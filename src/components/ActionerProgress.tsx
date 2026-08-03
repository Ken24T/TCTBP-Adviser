import type { ActionerJob } from '../../shared/actioner'

function actionerLabel(workflowId: ActionerJob['workflowId']): string {
  if (workflowId === 'publish') return 'Publish'
  if (workflowId === 'branch-development') return 'Branch development'
  if (workflowId === 'deploy-development') return 'Deploy development'
  if (workflowId === 'handover') return 'Handover'
  return 'Checkpoint'
}

interface ActionerProgressProps {
  job: ActionerJob
  onRepairCompatibility?: () => void
}

export function ActionerProgress({ job, onRepairCompatibility }: ActionerProgressProps) {
  return (
    <section className="actioner-progress" aria-live="polite">
      <strong>{actionerLabel(job.workflowId)} {job.status}</strong>
      <ol>
        {job.steps.map((step) => (
          <li key={step.id} className={`actioner-step-${step.status}`}>
            <span>{step.status === 'completed' ? '✓' : step.status === 'failed' ? '!' : step.status === 'running' ? '…' : '○'}</span>{' '}
            <strong>{step.label}</strong>
            {step.detail && <small> — {step.detail}</small>}
          </li>
        ))}
      </ol>
      {job.error && <p className="empty-state">{job.error}</p>}
      {job.workflowId === 'deploy-development'
        && job.status === 'failed'
        && job.error?.includes('require is not defined')
        && onRepairCompatibility && (
        <button
          className="intent-action-button"
          type="button"
          onClick={onRepairCompatibility}
        >
          Repair TCTBP script compatibility
        </button>
      )}
      {job.result && (
        <p className="empty-state">
          {job.result.summary
            ?? (job.result.pushed
              ? `Published ${job.result.branch ?? 'branch'} at ${job.result.commitSha?.slice(0, 12) ?? 'unknown commit'}.`
              : `Commit: ${job.result.commitSha?.slice(0, 12) ?? 'unknown commit'}. No push performed.`)}
        </p>
      )}
    </section>
  )
}
