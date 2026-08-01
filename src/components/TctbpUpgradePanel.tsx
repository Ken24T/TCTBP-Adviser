import { useState } from 'react'
import type { TctbpUpgradePlan } from '../../shared/tctbp-upgrade'
import {
  createTctbpPlanDocument,
  formatTctbpPlanJson,
  formatTctbpPlanMarkdown,
} from '../tctbp-plan-export'
import { PanelHeading } from './RepositoryState'

interface TctbpUpgradePanelProps {
  repositoryName: string
  plan: TctbpUpgradePlan | null
  busy: boolean
  applyBusy: boolean
  upgradeFeedback: string | null
  onLoad: () => void
  onApplyAdditions: () => void
}

export function TctbpUpgradePanel({
  repositoryName,
  plan,
  busy,
  applyBusy,
  upgradeFeedback,
  onLoad,
  onApplyAdditions,
}: TctbpUpgradePanelProps) {
  const [feedback, setFeedback] = useState<string | null>(null)

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
              || !plan.fingerprint
              || plan.blockers.length > 0
              || plan.actionCounts.add === 0
            }
            type="button"
            onClick={onApplyAdditions}
          >
            {applyBusy ? 'Applying…' : 'Apply additions (no commit/push)'}
          </button>
        </div>
      )}
      {feedback && <p className="empty-state">{feedback}</p>}
      {upgradeFeedback && <p className="empty-state">{upgradeFeedback}</p>}
      {plan && <PlanDetails plan={plan} />}
    </section>
  )
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
  if (disposition === 'review-required') return 'Review required'
  return 'Source unavailable'
}

function dispositionLabel(
  disposition: TctbpUpgradePlan['disposition'],
): string {
  if (disposition === 'current') return 'Current'
  if (disposition === 'review-required') return 'Review required'
  return 'Source unavailable'
}

function driftLabel(state: string): string {
  if (state === 'missing-target') return 'Missing'
  if (state === 'source-unavailable') return 'Unavailable'
  if (state === 'drifted') return 'Drifted'
  return 'Current'
}
