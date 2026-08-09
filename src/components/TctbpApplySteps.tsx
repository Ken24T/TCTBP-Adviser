import type { ReactNode } from 'react'

/**
 * Adaptive one-line narration of what to do next with this plan: commit a
 * pending apply, resolve a blocker, apply the applicable steps in order, or
 * nothing to do. Appears above the "Apply in this order" list so the
 * recommended path is explicit.
 */
export function NextStepsStrip({
  blocked,
  pendingCommit,
  applicableCount,
}: {
  blocked: boolean
  pendingCommit: boolean
  applicableCount: number
}) {
  const tone = pendingCommit
    ? 'bg-teal-50 border-teal-200 text-teal-900'
    : blocked
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : applicableCount > 0
        ? 'bg-teal-50 border-teal-200 text-teal-900'
        : 'bg-surface-soft border-border text-text-secondary'
  const message = pendingCommit
    ? 'The working tree has local changes — checkpoint or commit them, then continue applying.'
    : blocked
      ? 'This repository is blocked — resolve the blocker below, then apply in order.'
      : applicableCount > 0
        ? `Next: apply the ${applicableCount} step${applicableCount === 1 ? '' : 's'} in order, then review the working tree and checkpoint from the card.`
        : 'All managed files are current — nothing to apply. Review the plan, then checkpoint from the card when ready.'
  return <p className={`mb-3 p-3 rounded-lg border text-sm ${tone}`}>{message}</p>
}

/**
 * A numbered step in the "Apply in this order" list. When the step does not
 * apply to this repository (e.g. no policy drift), the button is replaced by
 * a quiet "nothing to apply" note so the recommended sequence stays visible.
 */
export function ApplyStep({
  number,
  title,
  description,
  active,
  children,
}: {
  number: number
  title: string
  description: string
  active: boolean
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-3 p-3 bg-surface-soft border border-border rounded-lg">
      <span
        aria-hidden="true"
        className={`grid w-6 h-6 text-xs font-bold place-items-center rounded-full shrink-0 ${
          active ? 'bg-teal-100 text-teal-800' : 'bg-surface-inset text-text-muted'
        }`}
      >
        {number}
      </span>
      <div className="flex-1 min-w-0">
        <strong className="block text-sm text-text-primary">{title}</strong>
        <p className="mt-0.5 text-xs text-text-muted">{description}</p>
        {active ? children : (
          <p className="mt-1.5 text-xs text-text-faint">
            Nothing to apply for this repository.
          </p>
        )}
      </div>
    </li>
  )
}
