import { useMemo, useState, type ReactNode } from 'react'
import type {
  GuardrailReference,
  ReferenceCatalogue,
  WorkflowReference,
} from '../../shared/reference'
import { Card, PageHeader, Badge } from './primitives'
import { ChevronDownIcon } from './icons'

type ReferenceMode = 'workflows' | 'guardrails'

export type SurfaceFilter = 'all' | 'chat' | 'automated'
export type FamilyFilter = 'all' | WorkflowReference['category']

const CATEGORY_ORDER: WorkflowReference['category'][] = [
  'inspection',
  'preservation',
  'continuation',
  'environment',
  'administration',
]

const CATEGORY_LABELS: Record<WorkflowReference['category'], string> = {
  inspection: 'Inspection',
  preservation: 'Preservation',
  continuation: 'Continuation',
  environment: 'Environment',
  administration: 'Administration',
}

export function filterWorkflows(
  workflows: WorkflowReference[],
  needle: string,
  surfaceFilter: SurfaceFilter,
  familyFilter: FamilyFilter,
): WorkflowReference[] {
  return workflows.filter((workflow) => {
    const haystack = (
      `${workflow.displayName} ${workflow.id} `
      + `${workflow.aliases.join(' ')} ${workflow.purpose}`
    ).toLocaleLowerCase()
    if (!haystack.includes(needle)) return false
    if (surfaceFilter === 'chat' && !workflow.chatInvokable) return false
    if (surfaceFilter === 'automated' && workflow.chatInvokable) return false
    if (familyFilter !== 'all' && workflow.category !== familyFilter) {
      return false
    }
    return true
  })
}

export function ReferenceExplorer({
  catalogue,
  onBack,
}: {
  catalogue: ReferenceCatalogue
  onBack: () => void
}) {
  const [mode, setMode] = useState<ReferenceMode>('workflows')
  const [query, setQuery] = useState('')
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all')
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>('all')
  const needle = query.trim().toLocaleLowerCase()
  const workflows = useMemo(() => filterWorkflows(
    catalogue.workflows,
    needle,
    surfaceFilter,
    familyFilter,
  ), [catalogue.workflows, needle, surfaceFilter, familyFilter])
  const guardrails = useMemo(() => catalogue.guardrails.filter((guardrail) => (
    (
      `${guardrail.title} ${guardrail.id} ${guardrail.meaning} `
      + guardrail.reasonCode
    ).toLocaleLowerCase().includes(needle)
  )), [catalogue.guardrails, needle])
  const groups = useMemo(() => CATEGORY_ORDER
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      workflows: workflows.filter(
        (workflow) => workflow.category === category,
      ),
    }))
    .filter((group) => group.workflows.length > 0),
  [workflows])

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        description={`Contract v${catalogue.contract.major}.0 · ${catalogue.workflows.length} workflows · ${catalogue.guardrails.length} guardrails · pinned to ${catalogue.contract.sourceRevision.slice(0, 7)}.`}
        eyebrow="Pinned TCTBP contract reference"
        onBack={onBack}
        title="TCTBP surface reference"
      />

      <Card className="p-5 space-y-4">
        <label className="block text-sm text-text-secondary">
          Search reference
          <input
            className="mt-1 w-full px-4 py-2.5 text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search workflows, triggers or guardrails"
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

        {mode === 'workflows' && (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-4 border-t border-border">
            <FilterGroup label="Surface">
              <FilterPill
                active={surfaceFilter === 'all'}
                label="All"
                onClick={() => setSurfaceFilter('all')}
              />
              <FilterPill
                active={surfaceFilter === 'chat'}
                label="Chat trigger"
                onClick={() => setSurfaceFilter('chat')}
              />
              <FilterPill
                active={surfaceFilter === 'automated'}
                label="Automated step"
                onClick={() => setSurfaceFilter('automated')}
              />
            </FilterGroup>
            <FilterGroup label="Family">
              <FilterPill
                active={familyFilter === 'all'}
                label="All"
                onClick={() => setFamilyFilter('all')}
              />
              {CATEGORY_ORDER.map((category) => (
                <FilterPill
                  active={familyFilter === category}
                  key={category}
                  label={CATEGORY_LABELS[category]}
                  onClick={() => setFamilyFilter(category)}
                />
              ))}
            </FilterGroup>
          </div>
        )}
      </Card>

      {mode === 'workflows' ? (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.category} aria-label={group.label}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-semibold text-text-primary">
                  {group.label}
                </h2>
                <Badge tone="neutral">{group.workflows.length}</Badge>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {group.workflows.map((workflow) => (
                  <WorkflowCard key={workflow.id} workflow={workflow} />
                ))}
              </div>
            </section>
          ))}
          {workflows.length === 0 && (
            <p className="text-text-secondary">No workflows match your search.</p>
          )}
        </div>
      ) : (
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6" aria-label="TCTBP guardrails">
          {guardrails.map((guardrail) => (
            <GuardrailCard key={guardrail.id} guardrail={guardrail} />
          ))}
          {guardrails.length === 0 && (
            <p className="text-text-secondary">No guardrails match your search.</p>
          )}
        </section>
      )}
    </div>
  )
}

function WorkflowCard({ workflow }: { workflow: WorkflowReference }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-xl font-semibold text-text-primary">
          {workflow.displayName}
        </h3>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {workflow.chatInvokable
            ? <Badge tone="success">Chat trigger</Badge>
            : <Badge tone="neutral">Automated step</Badge>}
          <Badge tone="accent">{workflow.id}</Badge>
        </div>
      </div>
      <p className="text-text-secondary">{workflow.purpose}</p>
      <ReferenceRow label="Triggers" value={workflow.aliases.join(' · ')} />
      <DetailsToggle open={open} onToggle={() => setOpen((value) => !value)} />
      {open && (
        <div className="space-y-2">
          <ReferenceRow label="Runner" value={workflow.runner} code />
          <ReferenceRow label="Branch rule" value={workflow.branchRestriction} />
          <ReferenceList label="Preconditions" items={workflow.preconditions} />
          <ReferenceList label="Does" items={[
            ...workflow.localEffects,
            ...workflow.remoteEffects,
          ]} />
          <ReferenceList label="Does not" items={workflow.nonEffects} />
          {workflow.relatedWorkflows.length > 0 && (
            <ReferenceChips
              label="Related"
              items={workflow.relatedWorkflows}
            />
          )}
          {workflow.guardrailIds.length > 0 && (
            <ReferenceChips
              label="Blocked by guardrails"
              items={workflow.guardrailIds}
            />
          )}
        </div>
      )}
    </Card>
  )
}

function GuardrailCard({ guardrail }: { guardrail: GuardrailReference }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-teal-600">
            {guardrail.reasonCode}
          </p>
          <h3 className="text-xl font-semibold text-text-primary">
            {guardrail.title}
          </h3>
        </div>
        <code className="text-xs bg-surface-inset px-1.5 py-0.5 rounded text-text-faint">
          {guardrail.id}
        </code>
      </div>
      <p className="text-text-secondary">{guardrail.meaning}</p>
      <DetailsToggle open={open} onToggle={() => setOpen((value) => !value)} />
      {open && (
        <div className="space-y-2">
          <ReferenceRow label="Blocks" value={guardrail.blocks.join(' · ')} />
          <ReferenceRow label="Safe response" value={guardrail.safeResponse} />
        </div>
      )}
    </Card>
  )
}

function DetailsToggle({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      aria-expanded={open}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded px-1 py-0.5"
      type="button"
      onClick={onToggle}
    >
      {open ? 'Hide details' : 'Show details'}
      <ChevronDownIcon
        className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      />
    </button>
  )
}

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold uppercase tracking-widest text-text-muted">
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={[
        'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
        active
          ? 'bg-teal-600 text-white shadow-soft'
          : 'bg-surface-soft text-text-secondary hover:bg-surface-hover border border-border',
      ].join(' ')}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
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

function ReferenceChips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="text-sm">
      <span className="block text-text-muted mb-1">{label}</span>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            className="px-2 py-0.5 text-xs rounded-full bg-surface-inset border border-border text-text-secondary"
            key={item}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
