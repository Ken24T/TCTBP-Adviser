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
import { PanelHeading } from './RepositoryState'

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
    <section className="panel wide-panel" aria-labelledby="upgrade-plan-title">
      <PanelHeading
        eyebrow="Canonical TCTBP-Web"
        title={plan ? dispositionTitle(plan.disposition) : 'Upgrade planner'}
        id="upgrade-plan-title"
      />
      <p>
        Preview managed TCTBP drift, or explicitly apply canonical managed files
        on a dedicated branch without commit or push.
      </p>
      <button
        className="upgrade-plan-button"
        disabled={busy}
        type="button"
        onClick={onLoad}
      >
        {busy ? 'Preparing plan…' : 'Preview upgrade plan'}
      </button>
      {plan && (
        <button
          className="upgrade-plan-button"
          disabled={
            aiBusy
            || (plan.disposition === 'bootstrap-required' && !bootstrapPlan?.request)
          }
          type="button"
          onClick={onReviewAi}
        >
          {aiBusy
            ? 'Asking Jasper…'
            : plan.disposition === 'bootstrap-required' && !bootstrapPlan?.request
              ? 'Prepare bootstrap plan first'
              : 'Ask Jasper to review this plan'}
        </button>
      )}
      {aiReview && <AiReviewDetails review={aiReview} />}
      {plan && aiReview?.status === 'available' && aiReview.planFingerprint === reviewFingerprint && (
        <label className="ai-acknowledgement">
          <input
            checked={aiAcknowledged}
            type="checkbox"
            onChange={(event) => setAiAcknowledged(event.currentTarget.checked)}
          />
          I have reviewed Jasper’s advisory and the deterministic plan.
        </label>
      )}
      {plan && (
        <div className="plan-export-actions" aria-label="Upgrade plan export">
          <button type="button" onClick={() => exportPlan('markdown')}>
            Download Markdown
          </button>
          <button type="button" onClick={() => exportPlan('json')}>
            Download JSON
          </button>
          <button type="button" onClick={() => void copyMarkdown()}>
            Copy Markdown
          </button>
          <button
            className="upgrade-apply-button"
            disabled={
              applyBusy
              || !aiApplyReady
              || !plan.fingerprint
              || plan.blockers.length > 0
              || plan.actionCounts.add === 0
            }
            type="button"
            onClick={onApplyAdditions}
          >
            {applyBusy ? 'Applying…' : 'Apply additions (no commit/push)'}
          </button>
          <button
            className="upgrade-apply-button"
            disabled={
              applyBusy
              || !aiApplyReady
              || !plan.fingerprint
              || plan.blockers.length > 0
              || plan.policy.state !== 'drifted'
            }
            type="button"
            onClick={onApplyPolicy}
          >
            Apply policy merge
          </button>
          <button
            className="upgrade-apply-button"
            disabled={
              applyBusy
              || !aiApplyReady
              || !plan.fingerprint
              || plan.blockers.length > 0
              || (plan.drift.obsoleteTargets?.length ?? 0) === 0
            }
            type="button"
            onClick={onDeleteObsolete}
          >
            Delete obsolete files
          </button>
        </div>
      )}
      {feedback && <p className="empty-state">{feedback}</p>}
      {upgradeFeedback && <p className="empty-state">{upgradeFeedback}</p>}
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
      {plan && <PlanDetails plan={plan} />}
    </section>
  )
}

function AiReviewDetails({ review }: { review: AiReviewResult }) {
  return (
    <section className="ai-review" aria-label="Jasper AI review">
      <strong>{aiReviewLabel(review.status)}</strong>
      {review.summary && <p>{review.summary}</p>}
      {review.risks.length > 0 && (
        <ul className="compact-list">
          {review.risks.map((risk) => (
            <li key={risk.message}>
              {risk.message}
              {risk.evidenceRefs.length > 0 && (
                <small> Evidence: {risk.evidenceRefs.join(', ')}</small>
              )}
              {risk.evidenceRefs.length === 0 && (
                <small> Evidence reference unavailable</small>
              )}
            </li>
          ))}
        </ul>
      )}
      {review.recommendedNextStep && (
        <p><strong>Next step:</strong> {review.recommendedNextStep}</p>
      )}
      {review.error && <p className="empty-state">{review.error}</p>}
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
      <dl className="key-value-list">
        <Row label="Disposition" value={dispositionLabel(plan.disposition)} />
        <Row label="Source alignment" value={plan.sourceAlignment} />
        <Row label="Source" value={plan.source.repository ?? 'Unavailable'} />
        <Row label="Source version" value={plan.source.version ?? 'Unknown'} />
        <Row
          label="Canonical revision"
          value={plan.source.revision?.slice(0, 12) ?? 'Unknown'}
        />
        <Row
          label="Target revision"
          value={plan.target.sourceRevision?.slice(0, 12) ?? 'Unknown'}
        />
        <Row
          label="Managed files"
          value={String(plan.source.managedFileCount)}
        />
        <Row
          label="Current / drifted / missing"
          value={`${plan.drift.counts.current} / ${plan.drift.counts.drifted} / ${plan.drift.counts['missing-target']}`}
        />
        <Row
          label="Preserve / add / review"
          value={`${plan.actionCounts.preserve} / ${plan.actionCounts.add} / ${plan.actionCounts.review}`}
        />
      </dl>
      {plan.source.message && <p className="empty-state">{plan.source.message}</p>}
      {plan.bootstrap && (
        <section className="bootstrap-plan" aria-label="TCTBP bootstrap plan">
          <strong>Bootstrap plan</strong>
          <p>
            Start on <code>{plan.bootstrap.recommendedBranch ?? 'a dedicated upgrade branch'}</code>.
          </p>
          <p>Required decisions before installation:</p>
          <ul className="compact-list">
            {plan.bootstrap.requiredInputs.map((input) => <li key={input}>{input}</li>)}
          </ul>
          <p>Preserved areas:</p>
          <ul className="compact-list">
            {plan.bootstrap.preserveAreas.map((area) => <li key={area}>{area}</li>)}
          </ul>
        </section>
      )}
      {plan.blockers.length > 0 && (
        <ul className="compact-list">
          {plan.blockers.map((blocker) => (
            <li key={blocker.code}>
              <strong>Blocked:</strong>{' '}{blocker.message}
            </li>
          ))}
        </ul>
      )}
      {plan.source.state === 'available' && plan.drift.files.some(
        (file) => file.state !== 'current',
      ) && (
        <ul className="compact-list">
          {plan.drift.files.filter((file) => file.state !== 'current').map((file) => (
            <li key={file.path}>
              <strong>{driftLabel(file.state)}</strong>{' '}
              <code>{file.path}</code>
            </li>
          ))}
        </ul>
      )}
      {(plan.drift.obsoleteTargets?.length ?? 0) > 0 && (
        <ul className="compact-list">
          {plan.drift.obsoleteTargets?.map((file) => (
            <li key={file.path}>
              <strong>Obsolete:</strong>{' '}<code>{file.path}</code>
            </li>
          ))}
        </ul>
      )}
      {plan.policy.differences.length > 0 && (
        <ul className="compact-list">
          {plan.policy.differences.map((difference) => (
            <li key={`${difference.area}-${difference.message}`}>
              <strong>{difference.area}</strong>{': '}{difference.message}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
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

function driftLabel(state: string): string {
  if (state === 'missing-target') return 'Missing'
  if (state === 'source-unavailable') return 'Unavailable'
  if (state === 'drifted') return 'Drifted'
  return 'Current'
}
