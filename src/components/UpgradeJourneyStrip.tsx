// A single, sticky "what's next" action bar for the TCTBP upgrade journey.
// Rendered directly under the hero, it owns the whole flow — plan, review,
// apply, checkpoint, publish, merge, cleanup — so the user never has to hunt
// for the next button in a different panel. Hides itself when no upgrade work
// is in play.
import type { AiReviewResult } from '../../shared/ai-review'
import type { RecommendationAction } from '../../shared/recommendation'
import type { TctbpUpgradePlan } from '../../shared/tctbp-upgrade'
import {
  resolveUpgradeJourney,
  type UpgradeJourneyStageId,
} from '../upgrade-journey'
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

interface UpgradeJourneyStripProps {
  plan: TctbpUpgradePlan | null
  aiReview: AiReviewResult | null
  aiAcknowledged: boolean
  primaryAction: RecommendationAction | null
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

export function UpgradeJourneyStrip({
  plan,
  aiReview,
  aiAcknowledged,
  primaryAction,
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
}: UpgradeJourneyStripProps) {
  const journey = resolveUpgradeJourney({
    plan,
    aiReview,
    aiAcknowledged,
    primaryAction,
  })
  if (!journey) return null

  const { current, stages } = journey
  const anyBusy = busy || aiBusy || applyBusy || actionBusy

  function runCurrent(): void {
    switch (current.action) {
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

  function buttonLabel(): string {
    switch (current.action) {
      case 'prepare':
        return busy ? 'Preparing plan…' : 'Preview upgrade plan'
      case 'review':
        return aiBusy ? 'Asking Jasper…' : 'Ask Jasper to review'
      case 'acknowledge':
        return 'I’ve reviewed — enable apply'
      case 'apply':
        return applyBusy ? 'Applying…' : current.label
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

  const mergePending = current.action === 'merge'

  return (
    <div
      aria-label="Upgrade journey"
      className={`sticky top-0 z-30 -mx-6 px-6 py-3 border-b border-border bg-[var(--ad-surface)] ${
        mergePending
          ? ''
          : 'shadow-[0_6px_16px_-8px_rgba(0,0,0,0.25)]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold uppercase tracking-widest text-teal-600">
            <span>Upgrade journey</span>
            <span className="flex flex-wrap items-center gap-x-1 normal-case tracking-normal font-medium text-text-muted">
              {stages.map((stage, index) => (
                <span
                  className={index === 0 ? 'text-teal-700 font-semibold' : undefined}
                  key={stage.id}
                >
                  {index > 0 && <span className="mr-1">→</span>}
                  {SHORT_LABELS[stage.id]}
                </span>
              ))}
            </span>
          </p>
          <strong className="mt-1 block text-sm text-text-primary">
            {current.label}
          </strong>
          <p className="text-xs text-text-secondary">{current.reason}</p>
        </div>
        <div className="shrink-0">
          {mergePending ? (
            <Button
              disabled={busy}
              size="sm"
              variant="secondary"
              onClick={onRefresh}
            >
              {busy ? 'Inspecting…' : 'Refresh after merging'}
            </Button>
          ) : (
            <Button
              disabled={anyBusy && current.action !== 'acknowledge'}
              size="sm"
              onClick={runCurrent}
            >
              {buttonLabel()}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
