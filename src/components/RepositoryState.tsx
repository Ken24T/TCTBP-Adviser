import type { RepositoryObservation } from '../../shared/inspection'
import {
  branchRoles,
  formatAge,
  formatEvidenceValue,
  syncSummary,
  workingTreeSummary,
} from '../presentation'
import type { RecommendationResult } from '../../shared/recommendation'
import { actionLabel, reasonLabel } from '../presentation'
import { Card, KeyValue, Panel } from './primitives'

interface RepositoryStateProps {
  observation: RepositoryObservation
  recommendation: RecommendationResult
}

export function RepositoryState({
  observation,
  recommendation,
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <Panel eyebrow="Branch model" title={model.strategy ?? 'Unknown strategy'}>
          <KeyValue
            items={[
              ...branchRoles(model).map(({ role, branch }) => ({ key: role, value: <code className="text-xs bg-surface-soft px-1.5 py-0.5 rounded">{branch}</code> })),
              { key: 'Current HEAD', value: <code className="text-xs bg-surface-soft px-1.5 py-0.5 rounded">{observation.head.sha?.slice(0, 8) ?? 'Unavailable'}</code> },
            ]}
          />
        </Panel>

        <Panel eyebrow="Guardrails" title="Blocked alternatives">
          {recommendation.blockedActions.length > 0 ? (
            <ul className="space-y-3">
              {recommendation.blockedActions.map((blocked) => (
                <li key={blocked.action} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <strong className="block text-sm font-semibold text-red-900">{actionLabel(blocked.action)}</strong>
                  <span className="text-sm text-red-700">{blocked.reasonCodes.map(reasonLabel).join('; ')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-secondary">
              No alternative workflow is blocked by the current recommendation.
            </p>
          )}
        </Panel>
      </div>

      <Panel eyebrow="Explainability" title="Evidence used">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="pb-2 font-medium">Field</th>
                <th className="pb-2 font-medium">Value</th>
                <th className="pb-2 font-medium">Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recommendation.evidence.map((item) => (
                <tr key={`${item.field}-${item.basis}`}>
                  <td className="py-3 pr-4 text-text-secondary">{item.field}</td>
                  <td className="py-3 pr-4 font-medium text-text-primary">
                    <code className="text-xs bg-surface-soft px-1.5 py-0.5 rounded">{formatEvidenceValue(item.value)}</code>
                  </td>
                  <td className="py-3 text-text-faint">{item.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
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
