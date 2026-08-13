import type { ActionerJob } from '../../shared/actioner'
import { Button, Card } from './primitives'

function actionerLabel(workflowId: ActionerJob['workflowId']): string {
  const labels: Record<ActionerJob['workflowId'], string> = {
    'checkpoint': 'Checkpoint',
    'publish': 'Publish',
    'branch-development': 'Branch development',
    'deploy-development': 'Deploy development',
    'promote-review': 'Promote review',
    'promote-production': 'Promote production',
    'ship': 'Ship',
    'handover': 'Handover',
    'resume': 'Resume',
    'repair-tctbp-script-compatibility': 'Repair TCTBP scripts',
    'add-origin': 'Add origin',
    'create-origin': 'Create on GitHub',
  }
  return labels[workflowId]
}

interface ActionerProgressProps {
  job: ActionerJob
  onRepairCompatibility?: () => void
}

export function ActionerProgress({ job, onRepairCompatibility }: ActionerProgressProps) {
  const statusTone = job.status === 'completed' ? 'success'
    : job.status === 'failed' ? 'danger'
    : job.status === 'running' ? 'info'
    : 'neutral'

  return (
    <Card className="p-4 border-l-4 border-l-teal-500" aria-live="polite">
      <div className="flex items-center gap-2 mb-3">
        <StatusDot tone={statusTone} />
        <strong className="text-text-primary">
          {actionerLabel(job.workflowId)} {job.status}
        </strong>
      </div>

      <ol className="space-y-2">
        {job.steps.map((step) => {
          const stepTone = step.status === 'completed' ? 'success'
            : step.status === 'failed' ? 'danger'
            : step.status === 'running' ? 'info'
            : 'neutral'
          const icon = step.status === 'completed' ? '✓'
            : step.status === 'failed' ? '!'
            : step.status === 'running' ? '…'
            : '○'

          return (
            <li key={step.id} className="flex items-start gap-3 text-sm">
              <span className={`shrink-0 w-5 h-5 grid place-items-center rounded-full text-xs font-bold ${dotClasses(stepTone)}`}>
                {icon}
              </span>
              <div className="flex-1">
                <strong className={step.status === 'completed' ? 'text-text-primary' : 'text-text-secondary'}>
                  {step.label}
                </strong>
                {step.detail && <small className="block text-text-faint"> — {step.detail}</small>}
              </div>
            </li>
          )
        })}
      </ol>

      {job.error && (
        <p className="mt-3 p-3 text-sm bg-red-50 text-red-900 border border-red-200 rounded-lg">
          {job.error}
        </p>
      )}

      {job.workflowId === 'deploy-development'
        && job.status === 'failed'
        && job.error?.includes('require is not defined')
        && onRepairCompatibility && (
        <Button className="mt-3" size="sm" onClick={onRepairCompatibility}>
          Repair TCTBP scripts
        </Button>
      )}

      {job.result && (
        <p className="mt-3 p-3 text-sm bg-surface-soft border border-border rounded-lg text-text-secondary">
          {job.result.summary
            ?? (job.result.pushed
              ? `Published ${job.result.branch ?? 'branch'} at ${job.result.commitSha?.slice(0, 12) ?? 'unknown commit'}.`
              : `Commit: ${job.result.commitSha?.slice(0, 12) ?? 'unknown commit'}. No push performed.`)}
        </p>
      )}
    </Card>
  )
}

function StatusDot({ tone }: { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  return (
    <span className={`w-2.5 h-2.5 rounded-full ${
      tone === 'success' ? 'bg-teal-500'
      : tone === 'warning' ? 'bg-amber-500'
      : tone === 'danger' ? 'bg-red-500'
      : tone === 'info' ? 'bg-blue-500'
      : 'bg-ink-400'
    }`} />
  )
}

function dotClasses(tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'): string {
  return tone === 'success' ? 'bg-teal-100 text-teal-800'
    : tone === 'warning' ? 'bg-amber-100 text-amber-800'
    : tone === 'danger' ? 'bg-red-100 text-red-900'
    : tone === 'info' ? 'bg-blue-100 text-blue-800'
    : 'bg-surface-soft text-text-muted border border-border'
}
