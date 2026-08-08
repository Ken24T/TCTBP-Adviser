// TCTBP file-size justification: this panel consolidates the TCTBP upgrade
// plan preview, Jasper AI review, plan export, apply actions, and the nested
// bootstrap form. Splitting would fragment closely related UI state and props.
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
import { TctbpBootstrapPanel } from './TctbpBootstrapPanel'
import { Button, Panel, PanelHeading, Badge } from './primitives'

interface TctbpUpgradePanelProps {
  repositoryName: string
  plan: TctbpUpgradePlan | null
  busy: boolean
  applyBusy: boolean
  upgradeFeedback: string | null
  aiReview: AiReviewResult | null
  aiBusy: boolean
  bootstrapPlan: TctbpBootstrapPlan | null
  bootstrapBusy: boolean
  bootstrapApplyBusy: boolean
  bootstrapApplyFeedback: string | null
  bootstrapJob: TctbpBootstrapJob | null
  onPrepareBootstrap: (request: TctbpBootstrapRequest) => void
  onApplyBootstrap: (request: TctbpBootstrapRequest) => void
  onLoad: () => void
  onReviewAi: () => void
  onApplyAdditions: () => void
  onApplyPolicy: () => void
  onDeleteObsolete: () => void
}

export function TctbpUpgradePanel({
  repositoryName,
  plan,
  busy,
  applyBusy,
  upgradeFeedback,
  aiReview,
  aiBusy,
  bootstrapPlan,
  bootstrapBusy,
  bootstrapApplyBusy,
  bootstrapApplyFeedback,
  bootstrapJob,
  onPrepareBootstrap,
  onApplyBootstrap,
  onLoad,
  onReviewAi,
  onApplyAdditions,
  onApplyPolicy,
  onDeleteObsolete,
}: TctbpUpgradePanelProps) {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [aiAcknowledged, setAiAcknowledged] = useState(false)
  const reviewFingerprint = bootstrapPlan?.fingerprint ?? plan?.fingerprint
  const aiApplyReady = Boolean(
    reviewFingerprint
    && aiReview?.status === 'available'
    && aiReview.planFingerprint === reviewFingerprint
    && aiAcknowledged,
  )

  useEffect(() => {
    setAiAcknowledged(false)
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
      eyebrow="Canonical TCTBP-Web"
      title={plan ? dispositionTitle(plan.disposition) : 'Upgrade planner'}
      id="upgrade-plan-title"
    >
      <p className="text-text-secondary mb-4">
        Preview managed TCTBP drift, or explicitly apply canonical managed files
        on a dedicated branch without commit or push.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button
          disabled={busy}
          onClick={onLoad}
          size="sm"
        >
          {busy ? 'Preparing plan…' : 'Preview upgrade plan'}
        </Button>
        {plan && (
          <Button
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
        <label className="flex items-center gap-2 p-3 bg-surface-soft border border-border rounded-lg text-sm text-text-primary cursor-pointer mb-4">
          <input
            checked={aiAcknowledged}
            className="w-4 h-4 text-teal-600 border-border rounded focus:ring-teal-500"
            type="checkbox"
            onChange={(event) => setAiAcknowledged(event.currentTarget.checked)}
          />
          I have reviewed Jasper’s advisory and the deterministic plan.
        </label>
      )}

      {plan && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4" aria-label="Upgrade plan export">
            <Button size="sm" variant="tertiary" onClick={() => exportPlan('markdown')}>
              Download Markdown
            </Button>
            <Button size="sm" variant="tertiary" onClick={() => exportPlan('json')}>
              Download JSON
            </Button>
            <Button size="sm" variant="tertiary" onClick={() => void copyMarkdown()}>
              Copy Markdown
            </Button>
            <Button
              className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
              disabled={
                applyBusy
                || !aiApplyReady
                || !plan.fingerprint
                || plan.blockers.length > 0
                || plan.actionCounts.add === 0
              }
              size="sm"
              onClick={onApplyAdditions}
            >
              {applyBusy ? 'Applying…' : 'Apply additions (no commit/push)'}
            </Button>
            <Button
              className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
              disabled={
                applyBusy
                || !aiApplyReady
                || !plan.fingerprint
                || plan.blockers.length > 0
                || plan.policy.state !== 'drifted'
              }
              size="sm"
              onClick={onApplyPolicy}
            >
              Apply policy merge
            </Button>
            <Button
              className="bg-red-50 text-red-900 border border-red-200 hover:bg-red-100"
              disabled={
                applyBusy
                || !aiApplyReady
                || !plan.fingerprint
                || plan.blockers.length > 0
                || (plan.drift.obsoleteTargets?.length ?? 0) === 0
              }
              size="sm"
              onClick={onDeleteObsolete}
            >
              Delete obsolete files
            </Button>
          </div>

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

function AiReviewDetails({ review }: { review: AiReviewResult }) {
  const tone = review.status === 'available' ? 'success'
    : review.status === 'invalid' || review.status === 'unavailable' ? 'warning'
    : 'neutral'
  return (
    <section className="mb-4 p-4 bg-surface-soft border border-border rounded-lg" aria-label="Jasper AI review">
      <strong className={`block text-sm font-semibold ${
        tone === 'success' ? 'text-teal-900'
        : tone === 'warning' ? 'text-amber-900'
        : 'text-text-primary'
      }`}>
        {aiReviewLabel(review.status)}
      </strong>
      {review.summary && <p className="mt-1 text-sm text-text-secondary">{review.summary}</p>}
      {review.risks.length > 0 && (
        <ul className="mt-2 space-y-2 text-sm">
          {review.risks.map((risk) => (
            <li key={risk.message} className="p-2 bg-surface-elevated border border-border rounded">
              {risk.message}
              {risk.evidenceRefs.length > 0 && (
                <small className="block mt-1 text-text-faint"> Evidence: {risk.evidenceRefs.join(', ')}</small>
              )}
              {risk.evidenceRefs.length === 0 && (
                <small className="block mt-1 text-text-faint"> Evidence reference unavailable</small>
              )}
            </li>
          ))}
        </ul>
      )}
      {review.recommendedNextStep && (
        <p className="mt-2 text-sm"><strong>Next step:</strong> {review.recommendedNextStep}</p>
      )}
      {review.error && <p className="mt-2 p-2 bg-red-50 text-red-900 rounded text-sm">{review.error}</p>}
    </section>
  )
}

function aiReviewLabel(status: AiReviewResult['status']): string {
  if (status === 'available') return 'Jasper review — advisory only'
  if (status === 'disabled') return 'Jasper review is not configured'
  if (status === 'invalid') return 'Jasper returned an invalid review'
  return 'Jasper review is unavailable'
}

function PlanDetails({ plan }: { plan: TctbpUpgradePlan }) {
  return (
    <>
      <dl className="space-y-2 mb-4">
        <Row label="Disposition" value={dispositionLabel(plan.disposition)} />
        <Row label="Source alignment" value={plan.sourceAlignment} />
        <Row label="Source" value={plan.source.repository ?? 'Unavailable'} />
        <Row label="Source version" value={plan.source.version ?? 'Unknown'} />
        <Row label="Canonical revision" value={plan.source.revision?.slice(0, 12) ?? 'Unknown'} />
        <Row label="Target revision" value={plan.target.sourceRevision?.slice(0, 12) ?? 'Unknown'} />
        <Row label="Managed files" value={String(plan.source.managedFileCount)} />
        <Row label="Current / drifted / missing" value={`${plan.drift.counts.current} / ${plan.drift.counts.drifted} / ${plan.drift.counts['missing-target']}`} />
        <Row label="Preserve / add / review" value={`${plan.actionCounts.preserve} / ${plan.actionCounts.add} / ${plan.actionCounts.review}`} />
      </dl>

      {plan.source.message && (
        <p className="mb-4 p-3 bg-surface-soft rounded-lg text-sm text-text-secondary">
          {plan.source.message}
        </p>
      )}

      {plan.bootstrap && (
        <section className="mb-4 p-4 bg-surface-soft border border-border rounded-lg" aria-label="TCTBP bootstrap plan">
          <strong className="block text-sm font-semibold text-text-primary mb-1">Bootstrap plan</strong>
          <p className="text-sm text-text-secondary">
            Start on <code className="text-xs bg-surface-inset px-1.5 py-0.5 rounded">{plan.bootstrap.recommendedBranch ?? 'a dedicated upgrade branch'}</code>.
          </p>
          <p className="mt-2 text-sm font-medium text-text-primary">Required decisions before installation:</p>
          <ul className="mt-1 space-y-1 text-sm text-text-secondary list-disc list-inside">
            {plan.bootstrap.requiredInputs.map((input) => <li key={input}>{input}</li>)}
          </ul>
          <p className="mt-2 text-sm font-medium text-text-primary">Preserved areas:</p>
          <ul className="mt-1 space-y-1 text-sm text-text-secondary list-disc list-inside">
            {plan.bootstrap.preserveAreas.map((area) => <li key={area}>{area}</li>)}
          </ul>
        </section>
      )}

      {plan.blockers.length > 0 && (
        <ul className="mb-4 space-y-2">
          {plan.blockers.map((blocker) => (
            <li key={blocker.code} className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-900">
              <strong>Blocked:</strong>{' '}{blocker.message}
            </li>
          ))}
        </ul>
      )}

      {plan.source.state === 'available' && plan.drift.files.some(
        (file) => file.state !== 'current',
      ) && (
        <ul className="mb-4 space-y-2">
          {plan.drift.files.filter((file) => file.state !== 'current').map((file) => (
            <li key={file.path} className="flex items-center gap-2 text-sm">
              <Badge tone={driftTone(file.state)}>{driftLabel(file.state)}</Badge>
              <code className="text-xs bg-surface-inset px-1.5 py-0.5 rounded">{file.path}</code>
            </li>
          ))}
        </ul>
      )}

      {(plan.drift.obsoleteTargets?.length ?? 0) > 0 && (
        <ul className="mb-4 space-y-2">
          {plan.drift.obsoleteTargets?.map((file) => (
            <li key={file.path} className="flex items-center gap-2 text-sm">
              <Badge tone="danger">Obsolete</Badge>
              <code className="text-xs bg-surface-inset px-1.5 py-0.5 rounded">{file.path}</code>
            </li>
          ))}
        </ul>
      )}

      {plan.policy.differences.length > 0 && (
        <ul className="mb-4 space-y-2">
          {plan.policy.differences.map((difference) => (
            <li key={`${difference.area}-${difference.message}`} className="text-sm text-text-secondary">
              <strong className="text-text-primary">{difference.area}</strong>{': '}{difference.message}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-sm font-medium text-text-primary text-right">{value}</dd>
    </div>
  )
}

function dispositionTitle(
  disposition: TctbpUpgradePlan['disposition'],
): string {
  if (disposition === 'current') return 'Current'
  if (disposition === 'bootstrap-required') return 'Bootstrap required'
  if (disposition === 'review-required') return 'Review required'
  return 'Source unavailable'
}

function dispositionLabel(
  disposition: TctbpUpgradePlan['disposition'],
): string {
  if (disposition === 'current') return 'Current'
  if (disposition === 'bootstrap-required') return 'Bootstrap required'
  if (disposition === 'review-required') return 'Review required'
  return 'Source unavailable'
}

function driftTone(state: string): 'warning' | 'danger' | 'info' | 'success' {
  if (state === 'missing-target') return 'danger'
  if (state === 'source-unavailable') return 'warning'
  if (state === 'drifted') return 'warning'
  return 'success'
}

function driftLabel(state: string): string {
  if (state === 'missing-target') return 'Missing'
  if (state === 'source-unavailable') return 'Unavailable'
  if (state === 'drifted') return 'Drifted'
  return 'Current'
}
