import type {
  UpgradeBatchRun,
  UpgradeBatchStageStatus,
} from '../../shared/upgrade-batch'
import { SpinnerIcon } from './icons'

/**
 * Stage-by-stage view of a running (or finished) upgrade batch run. Mirrors
 * the ActionerProgress pattern: a compact ordered list of the journey stages
 * with live status, plus the run-level error when a stage failed.
 */
export function UpgradeBatchProgress({ run }: { run: UpgradeBatchRun }) {
  const running = run.status === 'queued' || run.status === 'running'
  return (
    <div
      aria-label="Upgrade batch progress"
      className="p-4 rounded-lg border border-border bg-surface-soft text-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="text-text-primary">
          {run.status === 'failed'
            ? 'Upgrade batch stopped'
            : run.status === 'completed'
              ? 'Upgrade batch complete'
              : 'Running the upgrade journey'}
        </strong>
        {running && <SpinnerIcon className="w-4 h-4 text-teal-600" />}
      </div>
      <ol className="mt-3 space-y-1.5">
        {run.stages.map((stage) => (
          <li
            className="flex items-start gap-2 text-xs"
            key={stage.id}
          >
            <span className="mt-0.5 shrink-0 w-4 text-center">
              {stageStatusIcon(stage.status)}
            </span>
            <span
              className={
                stage.status === 'failed'
                  ? 'text-red-700 font-medium'
                  : stage.status === 'running'
                    ? 'text-text-primary font-medium'
                    : 'text-text-secondary'
              }
            >
              {stage.label}
            </span>
            {stage.detail && (
              <span className="text-text-muted">— {stage.detail}</span>
            )}
          </li>
        ))}
      </ol>
      {run.error && (
        <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          {run.error}
        </p>
      )}
      {run.status === 'failed' && (
        <p className="mt-2 text-xs text-text-muted">
          Continue manually from the Take action bar above.
        </p>
      )}
    </div>
  )
}

function stageStatusIcon(status: UpgradeBatchStageStatus): string {
  switch (status) {
    case 'completed':
      return '✓'
    case 'failed':
      return '✗'
    case 'running':
      return '…'
    case 'skipped':
      return '–'
    default:
      return '•'
  }
}
