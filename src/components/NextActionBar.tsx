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
import type { BatchableJourney } from '../upgrade-batch'
import { SpinnerIcon } from './icons'
import { Button } from './primitives'
import { formatAge } from '../presentation'

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
  onMergeUpgradeBranch: () => void
  onRefresh: () => void
  /** Safe-to-offer batch of the remaining journey stages. */
  batch?: BatchableJourney | null
  batchBusy?: boolean
  onRunBatch?: () => void
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
  onMergeUpgradeBranch,
  onRefresh,
  batch = null,
  batchBusy = false,
  onRunBatch,
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
      case 'merge':
        onMergeUpgradeBranch()
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
        // The bar drives apply-in-order; the planner below shows the detail.
        return applyBusy ? 'Applying…' : 'Apply in order'
      case 'checkpoint':
        return actionBusy ? 'Starting…' : 'Run Checkpoint'
      case 'publish':
        return actionBusy ? 'Starting…' : 'Run Publish'
      case 'merge':
        return applyBusy ? 'Merging…' : 'Merge upgrade branch'
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
          {busy && <SpinnerIcon className="w-4 h-4 mr-2" />}
          {busy ? 'Inspecting…' : 'Refresh'}
        </Button>
      )
    }
    if (action.kind === 'workflow') {
      return (
        <Button
          className={actionBusy ? 'disabled:!cursor-wait' : undefined}
          disabled={actionBusy}
          size="sm"
          onClick={onRunRecommended}
        >
          {actionBusy && <SpinnerIcon className="w-4 h-4 mr-2" />}
          {actionBusy ? 'Starting…' : `Run ${action.label}`}
        </Button>
      )
    }
    const journeyBusy = (anyBusy && current?.action !== 'acknowledge') || batchBusy
    return (
      <Button
        className={journeyBusy ? 'disabled:!cursor-wait' : undefined}
        disabled={journeyBusy}
        size="sm"
        onClick={runJourneyStep}
      >
        {journeyBusy && <SpinnerIcon className="w-4 h-4 mr-2" />}
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
      } ${anyBusy ? 'cursor-wait' : ''}`}
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
          <p className="text-xs text-text-secondary">
            {action.reason}
            {recommendation && (
              <span className="text-text-faint">
                {' · '}{formatAge(recommendation.freshness.ageMs)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {renderButton()}
          {batch?.safe && (
            <Button
              className={batchBusy ? 'disabled:!cursor-wait' : undefined}
              disabled={batchBusy || anyBusy}
              size="sm"
              variant="secondary"
              onClick={onRunBatch}
            >
              {batchBusy && <SpinnerIcon className="w-4 h-4 mr-2" />}
              {batchBusy ? 'Running…' : `Run all (${batch.stages.length})`}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
