import type { ActionerJob } from '../../shared/actioner'

function actionerLabel(workflowId: ActionerJob['workflowId']): string {
  if (workflowId === 'publish') return 'Publish'
  if (workflowId === 'branch-development') return 'Branch development'
  if (workflowId === 'deploy-development') return 'Deploy development'
  return 'Checkpoint'
}

export function ActionerProgress({ job }: { job: ActionerJob }) {
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
