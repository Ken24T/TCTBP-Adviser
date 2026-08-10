// TCTBP file-size note: this panel orchestrates the upgrade plan preview,
// apply actions, and the nested bootstrap form. The Jasper review, plan
// details, and apply-step primitives live in their own modules
// (AiReviewDetails, PlanDetails, TctbpApplySteps).
import { useEffect, useState } from 'react'
import type { AiReviewResult } from '../../shared/ai-review'
import type {
  TctbpBootstrapJob,
  TctbpBootstrapPlan,
  TctbpBootstrapRequest,
} from '../../shared/tctbp-bootstrap'
import type { TctbpUpgradePlan } from '../../shared/tctbp-upgrade'
import {
  createTctbpPlanDocument,
  formatTctbpPlanJson,
  formatTctbpPlanMarkdown,
} from '../tctbp-plan-export'
import { AiReviewDetails } from './AiReviewDetails'
import { PlanDetails } from './PlanDetails'
import { PlanExportMenu } from './PlanExportMenu'
import { NextStepsStrip, ApplyStep } from './TctbpApplySteps'
import { TctbpBootstrapPanel } from './TctbpBootstrapPanel'
import { Button, Panel } from './primitives'

interface TctbpUpgradePanelProps {
  repositoryName: string
  plan: TctbpUpgradePlan | null
  busy: boolean
  applyBusy: boolean
  upgradeFeedback: string | null
  aiReview: AiReviewResult | null
  aiBusy: boolean
  /** Controlled Jasper-review acknowledgment (shared with the journey strip). */
  aiAcknowledged?: boolean
  onAiAcknowledgedChange?: (value: boolean) => void
  bootstrapPlan: TctbpBootstrapPlan | null
  bootstrapBusy: boolean
  bootstrapApplyBusy: boolean
  bootstrapApplyFeedback: string | null
  bootstrapJob: TctbpBootstrapJob | null
  contractIncompatible?: boolean
  onPrepareBootstrap: (request: TctbpBootstrapRequest) => void
  onApplyBootstrap: (request: TctbpBootstrapRequest) => void
  onLoad: () => void
  onReviewAi: () => void
  onApplyAdditions: () => void
  onApplyPolicy: () => void
  onApplyDrifted: () => void
  onApplyAlignment: () => void
  onDeleteObsolete: () => void
  onApplyInOrder: () => void
  onCleanupUpgradeBranch: () => void
}

export function TctbpUpgradePanel({
  repositoryName,
  plan,
  busy,
  applyBusy,
  upgradeFeedback,
  aiReview,
  aiBusy,
  aiAcknowledged,
  onAiAcknowledgedChange,
  bootstrapPlan,
  bootstrapBusy,
  bootstrapApplyBusy,
  bootstrapApplyFeedback,
  bootstrapJob,
  contractIncompatible = false,
  onPrepareBootstrap,
  onApplyBootstrap,
  onLoad,
  onReviewAi,
  onApplyAdditions,
  onApplyPolicy,
  onApplyDrifted,
  onApplyAlignment,
  onDeleteObsolete,
  onApplyInOrder,
  onCleanupUpgradeBranch,
}: TctbpUpgradePanelProps) {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [localAiAcknowledged, setLocalAiAcknowledged] = useState(false)
  // Acknowledgment is controllable from the journey strip while remaining
  // self-contained when rendered standalone.
  const acked = aiAcknowledged ?? localAiAcknowledged
  function changeAcknowledged(value: boolean): void {
    setLocalAiAcknowledged(value)
    onAiAcknowledgedChange?.(value)
  }
  const reviewFingerprint = bootstrapPlan?.fingerprint ?? plan?.fingerprint
  const aiApplyReady = Boolean(
    reviewFingerprint
    && aiReview?.status === 'available'
    && aiReview.planFingerprint === reviewFingerprint
    && acked,
  )
  const alignmentPending = Boolean(
    plan
    && plan.sourceAlignment !== 'current'
    && plan.actionCounts.add === 0
    && plan.actionCounts.review === 0
    && plan.policy.state === 'aligned'
    && (plan.drift.obsoleteTargets?.length ?? 0) === 0
  )
  const applicableCount = plan
    ? [
        plan.policy.state === 'drifted',
        plan.actionCounts.add > 0,
        plan.actionCounts.review > 0,
        (plan.drift.obsoleteTargets?.length ?? 0) > 0,
        alignmentPending,
      ].filter(Boolean).length
    : 0

  useEffect(() => {
    setLocalAiAcknowledged(false)
  }, [aiReview?.reviewId])

  function exportPlan(format: 'markdown' | 'json'): void {
    if (!plan) return
    const planDocument = createTctbpPlanDocument(repositoryName, plan)
    const content = format === 'markdown'
      ? formatTctbpPlanMarkdown(planDocument)
      : formatTctbpPlanJson(planDocument)
    const extension = format === 'markdown' ? 'md' : 'json'
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${repositoryName}-tctbp-upgrade-plan.${extension}`
    link.click()
    URL.revokeObjectURL(url)
    setFeedback(`Downloaded ${format.toUpperCase()} plan.`)
  }

  async function copyMarkdown(): Promise<void> {
    if (!plan) return
    const planDocument = createTctbpPlanDocument(repositoryName, plan)
    await navigator.clipboard.writeText(formatTctbpPlanMarkdown(planDocument))
    setFeedback('Copied Markdown plan.')
  }

  return (
    <Panel
      actions={plan ? (
        <PlanExportMenu
          onCopy={() => void copyMarkdown()}
          onJson={() => exportPlan('json')}
          onMarkdown={() => exportPlan('markdown')}
        />
      ) : undefined}
      className={aiBusy ? 'cursor-wait' : undefined}
      eyebrow="Canonical TCTBP-Web"
      title={plan ? dispositionTitle(plan.disposition) : 'Upgrade planner'}
      id="upgrade-plan-title"
    >
      <p className="text-text-secondary mb-4">
        Preview managed TCTBP drift, or explicitly apply canonical managed files
        on a dedicated branch without commit or push.
      </p>

      {contractIncompatible && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          <strong>Review TCTBP:</strong>{' '}
          Your repository's TCTBP contract is incompatible with the canonical
          source. Preview the upgrade plan below to see what needs reconciling,
          then apply the canonical files.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {!plan && (
          <Button
            disabled={busy}
            onClick={onLoad}
            size="sm"
          >
            {busy ? 'Preparing plan…' : 'Preview upgrade plan'}
          </Button>
        )}
        {plan && (
          <Button
            className={aiBusy ? 'disabled:!cursor-wait' : undefined}
            disabled={
              aiBusy
              || (plan.disposition === 'bootstrap-required' && !bootstrapPlan?.request)
            }
            onClick={onReviewAi}
            size="sm"
            variant="secondary"
          >
            {aiBusy
              ? 'Asking Jasper…'
              : plan.disposition === 'bootstrap-required' && !bootstrapPlan?.request
                ? 'Prepare bootstrap plan first'
                : 'Ask Jasper to review this plan'}
          </Button>
        )}
      </div>

      {aiReview && <AiReviewDetails review={aiReview} />}

      {plan && aiReview?.status === 'available' && aiReview.planFingerprint === reviewFingerprint && (
        <label className={`flex items-center gap-2 p-3 bg-surface-soft border border-border rounded-lg text-sm text-text-primary mb-4 ${
          applicableCount === 0 ? 'cursor-default opacity-60' : 'cursor-pointer'
        }`}>
          <input
            checked={acked}
            className="w-4 h-4 text-teal-600 border-border rounded focus:ring-teal-500"
            disabled={applicableCount === 0}
            type="checkbox"
            onChange={(event) => changeAcknowledged(event.currentTarget.checked)}
          />
          I have reviewed Jasper’s advisory and the deterministic plan.
          {applicableCount === 0 && (
            <span className="text-xs text-text-muted">
              — nothing to apply, so no confirmation is needed.
            </span>
          )}
        </label>
      )}

      {plan && (
        <>
          <div className="mb-4" aria-label="Apply order">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
                Apply in this order
              </h3>
              {applicableCount > 0 && (
                <Button
                  disabled={
                    applyBusy
                    || !aiApplyReady
                    || !plan.fingerprint
                    || plan.blockers.length > 0
                  }
                  size="sm"
                  onClick={onApplyInOrder}
                >
                  {applyBusy
                    ? 'Applying…'
                    : `Apply in order (${applicableCount} step${applicableCount === 1 ? '' : 's'})`}
                </Button>
              )}
            </div>
            <NextStepsStrip
              applicableCount={applicableCount}
              blocked={plan.blockers.length > 0}
              pendingCommit={plan.blockers.length > 0 && plan.blockers.every(
                (blocker) => blocker.code === 'working-tree-dirty',
              )}
            />
            <ol className="space-y-2">
              <ApplyStep
                active={plan.policy.state === 'drifted'}
                description="Update .github/TCTBP.json to the canonical schema and policy first, so the managed-file surface matches the contract."
                number={1}
                title="Apply policy merge"
              >
                <Button
                  className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                  disabled={
                    applyBusy
                    || !aiApplyReady
                    || !plan.fingerprint
                    || plan.blockers.length > 0
                  }
                  size="sm"
                  onClick={onApplyPolicy}
                >
                  {applyBusy ? 'Applying…' : 'Apply policy merge'}
                </Button>
              </ApplyStep>
              <ApplyStep
                active={plan.actionCounts.add > 0}
                description={`Add ${plan.actionCounts.add} missing canonical managed file${plan.actionCounts.add === 1 ? '' : 's'}.`}
                number={2}
                title="Apply additions"
              >
                <Button
                  className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                  disabled={
                    applyBusy
                    || !aiApplyReady
                    || !plan.fingerprint
                    || plan.blockers.length > 0
                  }
                  size="sm"
                  onClick={onApplyAdditions}
                >
                  {applyBusy ? 'Applying…' : 'Apply additions (no commit/push)'}
                </Button>
              </ApplyStep>
              <ApplyStep
                active={plan.actionCounts.review > 0}
                description={`Reconcile ${plan.actionCounts.review} drifted managed file${plan.actionCounts.review === 1 ? '' : 's'} with the canonical source.`}
                number={3}
                title="Apply drifted files"
              >
                <Button
                  className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                  disabled={
                    applyBusy
                    || !aiApplyReady
                    || !plan.fingerprint
                    || plan.blockers.length > 0
                  }
                  size="sm"
                  onClick={onApplyDrifted}
                >
                  {applyBusy ? 'Applying…' : 'Apply drifted files'}
                </Button>
              </ApplyStep>
              <ApplyStep
                active={(plan.drift.obsoleteTargets?.length ?? 0) > 0}
                description={`Remove ${plan.drift.obsoleteTargets?.length ?? 0} file(s) the canonical TCTBP source no longer tracks.`}
                number={4}
                title="Delete obsolete files"
              >
                <Button
                  className="bg-red-50 text-red-900 border border-red-200 hover:bg-red-100"
                  disabled={
                    applyBusy
                    || !aiApplyReady
                    || !plan.fingerprint
                    || plan.blockers.length > 0
                  }
                  size="sm"
                  onClick={onDeleteObsolete}
                >
                  {applyBusy ? 'Applying…' : 'Delete obsolete files'}
                </Button>
              </ApplyStep>
              {alignmentPending && (
                <ApplyStep
                  active
                  description="The managed files match canonical, but the repository's source alignment is not recorded. Write .tctbp/source.json so future plans can confirm alignment."
                  number={5}
                  title="Record source alignment"
                >
                  <Button
                    className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                    disabled={
                      applyBusy
                      || !aiApplyReady
                      || !plan.fingerprint
                      || plan.blockers.length > 0
                    }
                    size="sm"
                    onClick={onApplyAlignment}
                  >
                    {applyBusy ? 'Applying…' : 'Record source alignment'}
                  </Button>
                </ApplyStep>
              )}
            </ol>
            <p className="mt-2 text-xs text-text-faint">
              Every apply only touches the working tree — nothing is committed or
              pushed.{plan.target.upgradeBranch ? (
                <> Apply first switches to a dedicated upgrade branch (<code className="bg-surface-inset px-1 py-0.5 rounded">{plan.target.upgradeBranch}</code>); checkpoint, publish, then merge it back to {plan.target.branch}.</>
              ) : null}{' '}
              Review the changes, then checkpoint them from the card.
            </p>
          </div>

          {plan.cleanup?.branch && (
            <div
              aria-label="Upgrade branch cleanup"
              className={`mb-4 p-3 rounded-lg border text-sm ${
                plan.cleanup.available
                  ? 'bg-teal-50 border-teal-200 text-teal-900'
                  : 'bg-surface-soft border-border text-text-secondary'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block font-semibold text-text-primary">
                    Upgrade branch cleanup
                  </strong>
                  <p className="mt-1 text-xs">
                    {plan.cleanup.available
                      ? `${plan.cleanup.branch} is fully merged and safe to remove — this deletes it locally and on origin.`
                      : plan.cleanup.reason}
                  </p>
                </div>
                {plan.cleanup.available && (
                  <Button
                    className="shrink-0"
                    disabled={applyBusy}
                    size="sm"
                    onClick={onCleanupUpgradeBranch}
                  >
                    {applyBusy ? 'Cleaning up…' : 'Clean up upgrade branch'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {feedback && (
            <p className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-900">
              {feedback}
            </p>
          )}
          {upgradeFeedback && (
            <p className="mb-4 p-3 bg-surface-soft border border-border rounded-lg text-sm text-text-secondary">
              {upgradeFeedback}
            </p>
          )}

          {plan?.disposition === 'bootstrap-required' && (
            <TctbpBootstrapPanel
              repositoryName={repositoryName}
              busy={bootstrapBusy}
              applyBusy={bootstrapApplyBusy}
              plan={bootstrapPlan}
              applyFeedback={bootstrapApplyFeedback}
              job={bootstrapJob}
              aiApplyReady={aiApplyReady}
              onPrepare={onPrepareBootstrap}
              onApply={onApplyBootstrap}
            />
          )}

          <PlanDetails plan={plan} />
        </>
      )}
    </Panel>
  )
}

/**
 * Panel title for the plan disposition.
 */
function dispositionTitle(
  disposition: TctbpUpgradePlan['disposition'],
): string {
  if (disposition === 'current') return 'Current'
  if (disposition === 'bootstrap-required') return 'Bootstrap required'
  if (disposition === 'review-required') return 'Review required'
  return 'Source unavailable'
}

