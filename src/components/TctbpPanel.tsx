import type { RepositoryObservation } from '../../shared/inspection'
import { CollapsiblePanel } from './CollapsiblePanel'

interface TctbpPanelProps {
  observation: RepositoryObservation
}

/**
 * Single collapsible "TCTBP profile" pane: the installation facts and the
 * quality-gate configuration are merged into one section so the page no
 * longer shows two separate panes for one topic. Collapsed by default.
 */
export function TctbpPanel({ observation }: TctbpPanelProps) {
  const { tctbp } = observation
  const gatesLine = tctbp.qualityGates
    .map((gate) => {
      const state = gate.configured
        ? gate.requiredBeforeShip
          ? '✓ required before ship'
          : '✓'
        : '–'
      return `${gateLabel(gate.id)} ${state}`
    })
    .join(' · ')
  return (
    <CollapsiblePanel
      eyebrow="TCTBP profile"
      title={tctbp.compatible ? 'Compatible' : 'Needs attention'}
    >
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
          { label: 'Managed surface', value: `${tctbp.scaffold.managedSurface.length} patterns` },
          { label: 'Source version', value: tctbp.scaffold.sourceVersion ?? 'Unknown' },
          { label: 'Evidence basis', value: 'Local working copy + local tracking refs' },
        ]}
      />
      <div className="mt-4 pt-4 border-t border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-1">Quality gates</h3>
        <p className="text-xs text-text-secondary leading-relaxed">{gatesLine}</p>
      </div>
    </CollapsiblePanel>
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

function gateLabel(id: string): string {
  return id.split('-').map(
    (part) => part.charAt(0).toUpperCase() + part.slice(1),
  ).join(' ')
}
