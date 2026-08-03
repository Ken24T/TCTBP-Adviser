import type { ActionerJob } from '../../shared/actioner'

export function ActionerProgress({ job }: { job: ActionerJob }) {
  return (
    <section className="actioner-progress" aria-live="polite">
      <strong>Checkpoint {job.status}</strong>
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
      {job.result && <p className="empty-state">Commit: {job.result.commitSha.slice(0, 12)}. No push performed.</p>}
    </section>
  )
}
