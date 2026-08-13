import type { RepositoryObservation } from '../../shared/inspection'
import {
  branchRoles,
  formatAge,
  syncSummary,
  workingTreeSummary,
} from '../presentation'
import { Card, KeyValue } from './primitives'
import { CollapsiblePanel } from './CollapsiblePanel'

interface RepositoryStateProps {
  observation: RepositoryObservation
}

export function RepositoryState({
  observation,
}: RepositoryStateProps) {
  const model = observation.tctbp.branchModel
  return (
    <>
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4" aria-label="Repository state">
        <StateCard
          label="Current branch"
          value={observation.head.branch ?? 'Detached HEAD'}
          note={model.strategy ? `${model.strategy} strategy` : 'Unknown strategy'}
        />
        <StateCard
          label="Working tree"
          value={workingTreeSummary(observation)}
          note={`${observation.workingTree.pathCount} changed path${observation.workingTree.pathCount === 1 ? '' : 's'}`}
          tone={observation.workingTree.clean ? 'good' : 'attention'}
        />
        <StateCard
          label="Local tracking"
          value={syncSummary(observation)}
          note={observation.localTracking.upstream ?? 'No configured upstream'}
          tone={observation.localTracking.state === 'in-sync' ? 'good' : 'attention'}
        />
        <StateCard
          label="Git operations"
          value={observation.operations.length > 0
            ? observation.operations.join(', ')
            : 'None active'}
          note={observation.workingTree.counts.conflicted > 0
            ? `${observation.workingTree.counts.conflicted} conflicts`
            : 'No operation guardrail active'}
          tone={observation.operations.length === 0 ? 'good' : 'stop'}
        />
        <StateCard
          label="Observation"
          value={formatAge(Math.max(0, Date.now() - Date.parse(observation.observedAt)))}
          note={observation.fetchPerformed ? 'Git fetch performed' : 'No Git fetch performed'}
        />
      </section>

      <CollapsiblePanel eyebrow="Branch model" title={model.strategy ?? 'Unknown strategy'}>
        <KeyValue
          items={[
            ...branchRoles(model).map(({ role, branch }) => ({ key: role, value: <code className="text-xs bg-surface-soft px-1.5 py-0.5 rounded">{branch}</code> })),
            { key: 'Current HEAD', value: <code className="text-xs bg-surface-soft px-1.5 py-0.5 rounded">{observation.head.sha?.slice(0, 8) ?? 'Unavailable'}</code> },
          ]}
        />
      </CollapsiblePanel>
    </>
  )
}

interface StateCardProps {
  label: string
  value: string
  note: string
  tone?: 'good' | 'attention' | 'stop'
}

function StateCard({ label, value, note, tone }: StateCardProps) {
  const toneClasses = tone === 'good'
    ? 'border-l-4 border-l-teal-500'
    : tone === 'attention'
    ? 'border-l-4 border-l-amber-500'
    : tone === 'stop'
    ? 'border-l-4 border-l-red-500'
    : 'border-l-4 border-l-ink-300'

  return (
    <Card className={`p-4 ${toneClasses}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted">{label}</p>
      <strong className="block mt-1 text-lg font-semibold text-text-primary truncate">{value}</strong>
      <small className="block mt-1 text-text-faint">{note}</small>
    </Card>
  )
}
