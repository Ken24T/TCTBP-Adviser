import type { TctbpUpgradePlan } from '../../shared/tctbp-upgrade'
import { blockerHint } from '../presentation'
import { Badge } from './primitives'

export function PlanDetails({ plan }: { plan: TctbpUpgradePlan }) {
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
            blocker.code === 'working-tree-dirty' ? (
              <li key={blocker.code} className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                <strong>Commit before continuing:</strong>{' '}
                The working tree has local changes — often a successful apply.
                Checkpoint (or commit/stash) them, then continue applying.
              </li>
            ) : (
              <li key={blocker.code} className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-900">
                <strong>Blocked:</strong>{' '}{blocker.message}
                {blockerHint(blocker.code) && (
                  <p className="mt-1 text-xs text-red-700">
                    How to resolve: {blockerHint(blocker.code)}
                  </p>
                )}
              </li>
            )
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
