import { useMemo, useState } from 'react'
import type { ReferenceCatalogue } from '../../shared/reference'
import { Card, PageHeader, Badge } from './primitives'

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
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        description={`Behavioural guidance from contract v${catalogue.contract.major}, pinned to ${catalogue.contract.sourceRevision.slice(0, 7)}.`}
        eyebrow="Pinned TCTBP contract reference"
        onBack={onBack}
        title="Triggers and guardrails"
      />

      <Card className="p-5 space-y-4">
        <label className="block text-sm text-text-secondary">
          Search reference
          <input
            className="mt-1 w-full px-4 py-2.5 text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search triggers, aliases or guardrails"
            type="search"
            value={query}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={[
              'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
              mode === 'workflows'
                ? 'bg-teal-600 text-white shadow-soft'
                : 'bg-surface-soft text-text-secondary hover:bg-surface-hover border border-border',
            ].join(' ')}
            type="button"
            onClick={() => setMode('workflows')}
          >
            Workflows ({catalogue.workflows.length})
          </button>
          <button
            className={[
              'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
              mode === 'guardrails'
                ? 'bg-teal-600 text-white shadow-soft'
                : 'bg-surface-soft text-text-secondary hover:bg-surface-hover border border-border',
            ].join(' ')}
            type="button"
            onClick={() => setMode('guardrails')}
          >
            Guardrails ({catalogue.guardrails.length})
          </button>
        </div>
      </Card>

      {mode === 'workflows' ? (
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6" aria-label="TCTBP workflows">
          {workflows.map((workflow) => (
            <Card key={workflow.id} className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-teal-600">{workflow.category}</p>
                  <h2 className="text-xl font-semibold text-text-primary">{workflow.displayName}</h2>
                </div>
                <Badge tone="accent">{workflow.id}</Badge>
              </div>
              <p className="text-text-secondary">{workflow.purpose}</p>
              <ReferenceRow label="Triggers" value={workflow.aliases.join(' · ')} />
              <ReferenceRow label="Runner" value={workflow.runner} code />
              <ReferenceRow label="Branch rule" value={workflow.branchRestriction} />
              <ReferenceList label="Preconditions" items={workflow.preconditions} />
              <ReferenceList label="Does" items={[
                ...workflow.localEffects,
                ...workflow.remoteEffects,
              ]} />
              <ReferenceList label="Does not" items={workflow.nonEffects} />
            </Card>
          ))}
        </section>
      ) : (
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6" aria-label="TCTBP guardrails">
          {guardrails.map((guardrail) => (
            <Card key={guardrail.id} className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-teal-600">{guardrail.reasonCode}</p>
              <h2 className="text-xl font-semibold text-text-primary">{guardrail.title}</h2>
              <code className="text-xs bg-surface-inset px-1.5 py-0.5 rounded text-text-faint">{guardrail.id}</code>
              <p className="text-text-secondary">{guardrail.meaning}</p>
              <ReferenceRow label="Blocks" value={guardrail.blocks.join(' · ')} />
              <ReferenceRow label="Safe response" value={guardrail.safeResponse} />
            </Card>
          ))}
        </section>
      )}
    </div>
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
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 py-2 border-b border-border last:border-0 text-sm">
      <span className="text-text-muted">{label}</span>
      {code
        ? <code className="text-xs bg-surface-inset px-1.5 py-0.5 rounded text-text-faint sm:text-right">{value}</code>
        : <strong className="text-text-primary sm:text-right">{value}</strong>}
    </div>
  )
}

function ReferenceList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="text-sm">
      <span className="block text-text-muted mb-1">{label}</span>
      <ul className="space-y-1 list-disc list-inside text-text-secondary">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}
