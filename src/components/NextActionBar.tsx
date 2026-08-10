// The always-visible, sticky "one place to act" bar for the repository detail
// page. It owns every action surface: the TCTBP upgrade journey while that is
// in play, otherwise the state-driven recommendation (one-click workflows like
// checkpoint/publish, or guidance), or a quiet healthy state. The hero section
// stays identity-only so there is never more than one prominent action target.
import type { ReactNode } from 'react'
import type { AiReviewResult } from '../../shared/ai-review'
import type {
  RecommendationAction,
  RecommendationResult,
} from '../../shared/recommendation'
import type { TctbpUpgradePlan } from '../../shared/tctbp-upgrade'
import {
  resolveNextAction,
} from '../next-action'
import type { UpgradeJourneyStageId } from '../upgrade-journey'
import { Button } from './primitives'

const SHORT_LABELS: Record<UpgradeJourneyStageId, string> = {
  prepare: 'Plan',
  review: 'Review',
  acknowledge: 'Confirm',
  apply: 'Apply',
  checkpoint: 'Checkpoint',
  publish: 'Publish',
  merge: 'Merge',
  cleanup: 'Clean up',
}

interface NextActionBarProps {
  plan: TctbpUpgradePlan | null
  aiReview: AiReviewResult | null
  aiAcknowledged: boolean
  primaryAction: RecommendationAction | null
  recommendation: RecommendationResult | null
  branchModel?: {
    workingBranch?: string | null
    preProductionBranch?: string | null
    productionBranch?: string | null
  } | null
  onAiAcknowledgedChange: (value: boolean) => void
  busy: boolean
  aiBusy: boolean
  applyBusy: boolean
  actionBusy: boolean
  onLoad: () => void
  onReviewAi: () => void
  onApplyInOrder: () => void
  onRunRecommended: () => void
  onCleanupUpgradeBranch: () => void
  onRefresh: () => void
}

export function NextActionBar({
  plan,
  aiReview,
  aiAcknowledged,
  primaryAction,
  recommendation,
  branchModel,
  onAiAcknowledgedChange,
  busy,
  aiBusy,
  applyBusy,
  actionBusy,
  onLoad,
  onReviewAi,
  onApplyInOrder,
  onRunRecommended,
  onCleanupUpgradeBranch,
  onRefresh,
}: NextActionBarProps) {
  const action = resolveNextAction({
    plan,
    aiReview,
    aiAcknowledged,
    primaryAction,
    recommendation,
    branchModel,
  })
  const anyBusy = busy || aiBusy || applyBusy || actionBusy
  const journey = action.kind === 'journey' ? action.journey : undefined
  const current = journey?.current
  const mergePending = current?.action === 'merge'

  function runJourneyStep(): void {
    switch (current?.action) {
      case 'prepare':
        onLoad()
        break
      case 'review':
        onReviewAi()
        break
      case 'acknowledge':
        onAiAcknowledgedChange(true)
        break
      case 'apply':
        onApplyInOrder()
        break
      case 'checkpoint':
      case 'publish':
        onRunRecommended()
        break
      case 'cleanup':
        onCleanupUpgradeBranch()
        break
      default:
        break
    }
  }

  function journeyButtonLabel(): string {
    switch (current?.action) {
      case 'prepare':
        return busy ? 'Preparing plan…' : 'Preview upgrade plan'
      case 'review':
        return aiBusy ? 'Asking Jasper…' : 'Ask Jasper to review'
      case 'acknowledge':
        return 'I’ve reviewed — enable apply'
      case 'apply':
        return applyBusy ? 'Applying…' : current?.label ?? 'Apply'
      case 'checkpoint':
        return actionBusy ? 'Starting…' : 'Run Checkpoint'
      case 'publish':
        return actionBusy ? 'Starting…' : 'Run Publish'
      case 'cleanup':
        return applyBusy ? 'Cleaning up…' : 'Clean up upgrade branch'
      default:
        return 'Continue'
    }
  }

  function renderButton(): ReactNode {
    if (action.kind === 'none') return null
    if (action.kind === 'guidance') {
      return (
        <Button disabled={busy} size="sm" variant="secondary" onClick={onRefresh}>
          {busy ? 'Inspecting…' : 'Refresh'}
        </Button>
      )
    }
    if (action.kind === 'workflow') {
      return (
        <Button
          disabled={actionBusy}
          size="sm"
          onClick={onRunRecommended}
        >
          {actionBusy ? 'Starting…' : `Run ${action.label}`}
        </Button>
      )
    }
    // journey
    if (mergePending) {
      return (
        <Button disabled={busy} size="sm" variant="secondary" onClick={onRefresh}>
          {busy ? 'Inspecting…' : 'Refresh after merging'}
        </Button>
      )
    }
    return (
      <Button
        disabled={anyBusy && current?.action !== 'acknowledge'}
        size="sm"
        onClick={runJourneyStep}
      >
        {journeyButtonLabel()}
      </Button>
    )
  }

  const quiet = action.kind === 'none'

  return (
    <div
      aria-label="Next action"
      className={`sticky top-0 z-30 py-3 border-b border-border bg-[var(--ad-surface)] ${
        quiet ? '' : 'shadow-[0_6px_16px_-8px_rgba(0,0,0,0.25)]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold uppercase tracking-widest ${
              quiet ? 'text-text-muted' : 'text-teal-600'
            }`}
          >
            <span>{action.headline}</span>
            {journey && current && (
              <span className="flex flex-wrap items-center gap-x-1 normal-case tracking-normal font-medium text-text-muted">
                {journey.stages.map((stage, index) => (
                  <span
                    className={index === 0 ? 'text-teal-700 font-semibold' : undefined}
                    key={stage.id}
                  >
                    {index > 0 && <span className="mr-1">→</span>}
                    {SHORT_LABELS[stage.id]}
                  </span>
                ))}
              </span>
            )}
            {action.trigger && action.kind === 'guidance' && (
              <code className="normal-case tracking-normal font-medium text-text-muted bg-surface-inset px-1.5 py-0.5 rounded">
                {action.trigger}
              </code>
            )}
          </p>
          <strong className={`mt-1 block text-sm ${quiet ? 'text-text-secondary' : 'text-text-primary'}`}>
            {action.label}
          </strong>
          <p className="text-xs text-text-secondary">{action.reason}</p>
        </div>
        <div className="shrink-0">{renderButton()}</div>
      </div>
    </div>
  )
}
