import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { PortfolioRepository } from '../../shared/portfolio'
import {
  formatAge,
  portfolioTone,
  reasonLabel,
  recommendationTitle,
  syncSummaryFromState,
  upgradeLabel,
} from '../presentation'

export interface CardCalloutPlacement {
  /** Viewport x for the callout's left edge. */
  left: number
  /** Viewport y for the callout's top edge. */
  top: number
}

interface CardCalloutProps {
  repository: PortfolioRepository
  visible: boolean
  /** Card surface CSS variables, re-applied when the callout is portaled. */
  surface?: CSSProperties
  placement?: CardCalloutPlacement | null
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

const TONE_DOTS: Record<'action-recommended' | 'healthy' | 'attention' | 'stop', string> = {
  'action-recommended': 'bg-teal-500',
  healthy: 'bg-teal-500',
  attention: 'bg-amber-500',
  stop: 'bg-red-500',
}

/**
 * Hover/focus callout for a portfolio card. Surfaces the "why" behind a card
 * (recommended action, reasons, sync, working tree, TCTBP, upgrade, observed
 * age) without navigating to the details page — and without adding a line to
 * the card face. When a `placement` is supplied the callout is portaled to
 * document.body with fixed viewport coordinates (so it paints above sibling
 * cards and their stacking contexts) and sits beside the card; without one it
 * falls back to the inline overlay position. Renders nothing when `visible`
 * is false.
 */
export function CardCallout({
  repository,
  visible,
  surface,
  placement,
  onMouseEnter,
  onMouseLeave,
}: CardCalloutProps) {
  if (!visible) return null
  const tone = portfolioTone(repository)
  const reasons = repository.recommendation?.reasonCodes.map(reasonLabel) ?? []
  const workingTree = repository.workingTree
  const tctbp = repository.tctbp
  const upgrade = repository.upgrade
  const observed = repository.observedAt
    ? formatAge(Math.max(0, Date.now() - Date.parse(repository.observedAt)))
    : repository.error?.message ?? 'No observation available'

  const callout = (
    <div
      className={[
        'z-50 w-72 rounded-xl border border-[var(--card-btn-border)] border-t-[3px] border-t-[var(--card-accent)] bg-[var(--card-text-block-bg)] p-4 shadow-[0_8px_24px_rgba(var(--card-accent-rgb),0.30),0_2px_8px_rgba(var(--card-accent-rgb),0.18)]',
        placement ? 'fixed' : 'absolute right-2 top-14',
      ].join(' ')}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="tooltip"
      style={placement ? { ...surface, left: placement.left, top: placement.top } : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
          <span aria-hidden="true" className={`w-2 h-2 rounded-full ${TONE_DOTS[tone]}`} />
          Recommended
        </span>
        <strong className="text-sm text-text-primary text-right">
          {recommendationTitle(repository)}
        </strong>
      </div>
      {reasons.length > 0 && (
        <p className="mt-1.5 text-xs text-text-muted">{reasons.join(' · ')}</p>
      )}

      <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
        {repository.localTracking && (
          <CalloutRow
            label="Sync"
            value={syncSummaryFromState(repository.localTracking)}
          />
        )}
        {workingTree && (
          <CalloutRow
            label="Working tree"
            value={workingTree.clean ? 'Clean' : `${workingTree.pathCount} changed`}
          />
        )}
        {tctbp && (
          <CalloutRow
            label="TCTBP"
            value={tctbp.installed
              ? tctbp.compatible
                ? `Installed · schema ${tctbp.schemaVersion ?? '?'}`
                : 'Installed · incompatible'
              : 'Not installed'}
          />
        )}
        {upgrade && (
          <CalloutRow label="Upgrade" value={upgradeLabel(upgrade.disposition)} />
        )}
        <CalloutRow label="Observed" value={observed} />
      </div>

      {upgrade && upgrade.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-border pt-2">
          {upgrade.reasons.map((reason) => (
            <li className="text-xs text-text-muted" key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  )

  if (placement && typeof document !== 'undefined') {
    return createPortal(callout, document.body)
  }
  return callout
}

function CalloutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-primary text-right">{value}</span>
    </div>
  )
}
