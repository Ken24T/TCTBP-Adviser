import type { TctbpUpgradePlan } from '../../shared/tctbp-upgrade'
import { PanelHeading } from './RepositoryState'

interface TctbpUpgradePanelProps {
  plan: TctbpUpgradePlan | null
  busy: boolean
  onLoad: () => void
}

export function TctbpUpgradePanel({
  plan,
  busy,
  onLoad,
}: TctbpUpgradePanelProps) {
  return (
    <section className="panel wide-panel" aria-labelledby="upgrade-plan-title">
      <PanelHeading
        eyebrow="Canonical TCTBP-Web"
        title={plan ? dispositionTitle(plan.disposition) : 'Upgrade planner'}
        id="upgrade-plan-title"
      />
      <p>
        Preview managed TCTBP file drift without changing this repository.
      </p>
      <button
        className="upgrade-plan-button"
        disabled={busy}
        type="button"
        onClick={onLoad}
      >
        {busy ? 'Preparing plan…' : 'Preview upgrade plan'}
      </button>
      {plan && <PlanDetails plan={plan} />}
    </section>
  )
}

function PlanDetails({ plan }: { plan: TctbpUpgradePlan }) {
  return (
    <>
      <dl className="key-value-list">
        <Row label="Disposition" value={dispositionLabel(plan.disposition)} />
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
      </dl>
      {plan.source.message && <p className="empty-state">{plan.source.message}</p>}
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
