import type { RepositoryObservation } from '../../shared/inspection'
import { Panel, PanelHeading, Badge } from './primitives'

interface TctbpPanelProps {
  observation: RepositoryObservation
}

export function TctbpPanel({ observation }: TctbpPanelProps) {
  const { tctbp } = observation
  const configuredGates = tctbp.qualityGates.filter((gate) => gate.configured)
  return (
    <div className="space-y-6">
      <Panel eyebrow="TCTBP installation" title={tctbp.compatible ? 'Compatible' : 'Needs attention'}>
        <KeyValue
          items={[
            { label: 'Schema', value: tctbp.schemaVersion?.toString() ?? 'Unknown' },
            {
              label: 'Adviser contract',
              value: tctbp.contract.major === null
                ? 'Unavailable'
                : `v${tctbp.contract.major}.${tctbp.contract.minor ?? 0}`,
            },
            { label: 'Advertised workflows', value: String(tctbp.workflows.length) },
            { label: 'Evidence basis', value: 'Local working copy + local tracking refs' },
          ]}
        />
      </Panel>

      <Panel eyebrow="Scaffold health" title={scaffoldTitle(tctbp.scaffold.status)}>
        <KeyValue
          items={[
            { label: 'Managed surface', value: `${tctbp.scaffold.managedSurface.length} patterns` },
            { label: 'Missing patterns', value: String(tctbp.scaffold.missingManagedPatterns.length) },
            { label: 'Source version', value: tctbp.scaffold.sourceVersion ?? 'Unknown' },
            { label: 'Source revision', value: tctbp.scaffold.sourceRevision?.slice(0, 10) ?? 'Unknown' },
          ]}
        />
        {tctbp.scaffold.missingManagedPatterns.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm text-text-secondary list-disc list-inside">
            {tctbp.scaffold.missingManagedPatterns.map((pattern) => (
              <li key={pattern}><code className="text-xs bg-surface-soft px-1.5 py-0.5 rounded">{pattern}</code></li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel eyebrow="Quality policy" title="Configured gates">
        {configuredGates.length > 0 ? (
          <ul className="space-y-2">
            {configuredGates.map((gate) => (
              <li key={gate.id} className="flex items-center gap-3 p-3 bg-surface-soft rounded-lg">
                <span className="grid w-6 h-6 place-items-center rounded-full bg-teal-100 text-teal-700 text-xs font-bold" aria-hidden="true">✓</span>
                <div className="flex-1">
                  <strong className="block text-sm text-text-primary">{gateLabel(gate.id)}</strong>
                  <small className="text-xs text-text-muted">
                    {gate.requiredBeforeShip
                      ? 'Required before ship'
                      : 'Configured, not a ship requirement'}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-secondary">No quality-gate commands are configured.</p>
        )}
      </Panel>
    </div>
  )
}

function KeyValue({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="space-y-3">
      {items.map(({ label, value }) => (
        <div key={label} className="flex items-start justify-between gap-4">
          <dt className="text-sm text-text-muted">{label}</dt>
          <dd className="text-sm font-medium text-text-primary text-right">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function scaffoldTitle(status: 'complete' | 'incomplete' | 'unknown'): string {
  if (status === 'complete') return 'Managed surface present'
  if (status === 'incomplete') return 'Managed files missing'
  return 'Source manifest unavailable'
}

function gateLabel(id: string): string {
  return id.split('-').map(
    (part) => part.charAt(0).toUpperCase() + part.slice(1),
  ).join(' ')
}
