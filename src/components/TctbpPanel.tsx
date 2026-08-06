import type { RepositoryObservation } from '../../shared/inspection'
import { PanelHeading } from './RepositoryState'

interface TctbpPanelProps {
  observation: RepositoryObservation
}

export function TctbpPanel({ observation }: TctbpPanelProps) {
  const { tctbp } = observation
  const configuredGates = tctbp.qualityGates.filter((gate) => gate.configured)
  return (
    <div className="detail-grid">
      <section className="panel" aria-labelledby="tctbp-title">
        <PanelHeading
          eyebrow="TCTBP installation"
          title={tctbp.compatible ? 'Compatible' : 'Needs attention'}
          id="tctbp-title"
        />
        <dl className="key-value-list">
          <Row label="Schema" value={tctbp.schemaVersion?.toString() ?? 'Unknown'} />
          <Row
            label="Adviser contract"
            value={tctbp.contract.major === null
              ? 'Unavailable'
              : `v${tctbp.contract.major}.${tctbp.contract.minor ?? 0}`}
          />
          <Row label="Advertised workflows" value={String(tctbp.workflows.length)} />
          <Row
            label="Evidence basis"
            value="Local working copy + local tracking refs"
          />
        </dl>
      </section>

      <section className="panel" aria-labelledby="scaffold-title">
        <PanelHeading
          eyebrow="Scaffold health"
          title={scaffoldTitle(tctbp.scaffold.status)}
          id="scaffold-title"
        />
        <dl className="key-value-list">
          <Row
            label="Managed surface"
            value={`${tctbp.scaffold.managedSurface.length} patterns`}
          />
          <Row
            label="Missing patterns"
            value={String(tctbp.scaffold.missingManagedPatterns.length)}
          />
          <Row
            label="Source version"
            value={tctbp.scaffold.sourceVersion ?? 'Unknown'}
          />
          <Row
            label="Source revision"
            value={tctbp.scaffold.sourceRevision?.slice(0, 10) ?? 'Unknown'}
          />
        </dl>
        {tctbp.scaffold.missingManagedPatterns.length > 0 && (
          <ul className="compact-list">
            {tctbp.scaffold.missingManagedPatterns.map((pattern) => (
              <li key={pattern}><code>{pattern}</code></li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel wide-panel" aria-labelledby="gates-title">
        <PanelHeading
          eyebrow="Quality policy"
          title="Configured gates"
          id="gates-title"
        />
        {configuredGates.length > 0 ? (
          <div className="gate-list">
            {configuredGates.map((gate) => (
              <div key={gate.id}>
                <span className="gate-mark" aria-hidden="true">✓</span>
                <strong>{gateLabel(gate.id)}</strong>
                <small>
                  {gate.requiredBeforeShip
                    ? 'Required before ship'
                    : 'Configured, not a ship requirement'}
                </small>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">No quality-gate commands are configured.</p>
        )}
      </section>
    </div>
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
