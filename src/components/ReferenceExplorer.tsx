import { useMemo, useState } from 'react'
import type { ReferenceCatalogue } from '../../shared/reference'

type ReferenceMode = 'workflows' | 'guardrails'

export function ReferenceExplorer({
  catalogue,
  onBack,
}: {
  catalogue: ReferenceCatalogue
  onBack: () => void
}) {
  const [mode, setMode] = useState<ReferenceMode>('workflows')
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase()
  const workflows = useMemo(() => catalogue.workflows.filter((workflow) => (
    (
      `${workflow.displayName} ${workflow.id} `
      + `${workflow.aliases.join(' ')} ${workflow.purpose}`
    ).toLocaleLowerCase().includes(needle)
  )), [catalogue.workflows, needle])
  const guardrails = useMemo(() => catalogue.guardrails.filter((guardrail) => (
    (
      `${guardrail.title} ${guardrail.id} ${guardrail.meaning} `
      + guardrail.reasonCode
    ).toLocaleLowerCase().includes(needle)
  )), [catalogue.guardrails, needle])

  return (
    <>
      <header className="reference-page-header">
        <div>
          <button className="back-button" type="button" onClick={onBack}>
            ← Portfolio
          </button>
          <p className="eyebrow">Pinned TCTBP contract reference</p>
          <h1>Triggers and guardrails</h1>
          <p>
            Behavioural guidance from contract v{catalogue.contract.major},
            pinned to {catalogue.contract.sourceRevision.slice(0, 7)}.
          </p>
        </div>
      </header>

      <section className="reference-controls">
        <label>
          <span>Search reference</span>
          <input
            type="search"
            value={query}
            placeholder="Search triggers, aliases or guardrails"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <div>
          <button
            className={mode === 'workflows' ? 'selected' : ''}
            type="button"
            onClick={() => setMode('workflows')}
          >
            Workflows ({catalogue.workflows.length})
          </button>
          <button
            className={mode === 'guardrails' ? 'selected' : ''}
            type="button"
            onClick={() => setMode('guardrails')}
          >
            Guardrails ({catalogue.guardrails.length})
          </button>
        </div>
      </section>

      {mode === 'workflows' ? (
        <section className="reference-card-grid" aria-label="TCTBP workflows">
          {workflows.map((workflow) => (
            <article className="reference-card" key={workflow.id}>
              <p className="eyebrow">{workflow.category}</p>
              <h2>{workflow.displayName}</h2>
              <p>{workflow.purpose}</p>
              <ReferenceRow label="Triggers" value={workflow.aliases.join(' · ')} />
              <ReferenceRow label="Runner" value={workflow.runner} code />
              <ReferenceRow
                label="Branch rule"
                value={workflow.branchRestriction}
              />
              <ReferenceList label="Preconditions" items={workflow.preconditions} />
              <ReferenceList label="Does" items={[
                ...workflow.localEffects,
                ...workflow.remoteEffects,
              ]} />
              <ReferenceList label="Does not" items={workflow.nonEffects} />
            </article>
          ))}
        </section>
      ) : (
        <section className="reference-card-grid" aria-label="TCTBP guardrails">
          {guardrails.map((guardrail) => (
            <article className="reference-card guardrail-card" key={guardrail.id}>
              <p className="eyebrow">{guardrail.reasonCode}</p>
              <h2>{guardrail.title}</h2>
              <code>{guardrail.id}</code>
              <p>{guardrail.meaning}</p>
              <ReferenceRow
                label="Blocks"
                value={guardrail.blocks.join(' · ')}
              />
              <ReferenceRow
                label="Safe response"
                value={guardrail.safeResponse}
              />
            </article>
          ))}
        </section>
      )}
    </>
  )
}

function ReferenceRow({
  label,
  value,
  code = false,
}: {
  label: string
  value: string
  code?: boolean
}) {
  return (
    <div className="reference-row">
      <span>{label}</span>
      {code ? <code>{value}</code> : <strong>{value}</strong>}
    </div>
  )
}

function ReferenceList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="reference-list">
      <span>{label}</span>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  )
}
