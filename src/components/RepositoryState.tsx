import type { RepositoryObservation } from '../../shared/inspection'
import {
  branchRoles,
  formatEvidenceValue,
  syncSummary,
  workingTreeSummary,
} from '../presentation'
import type { RecommendationResult } from '../../shared/recommendation'
import { actionLabel, reasonLabel } from '../presentation'

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
      <section className="state-grid" aria-label="Repository state">
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
      </section>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="branches-title">
          <PanelHeading
            eyebrow="Branch model"
            title={model.strategy ?? 'Unknown strategy'}
            id="branches-title"
          />
          <dl className="key-value-list">
            {branchRoles(model).map(({ role, branch }) => (
              <div key={role}>
                <dt>{role}</dt>
                <dd><code>{branch}</code></dd>
              </div>
            ))}
            <div>
              <dt>Current HEAD</dt>
              <dd><code>{observation.head.sha?.slice(0, 8) ?? 'Unavailable'}</code></dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-labelledby="blocked-title">
          <PanelHeading
            eyebrow="Guardrails"
            title="Blocked alternatives"
            id="blocked-title"
          />
          {recommendation.blockedActions.length > 0 ? (
            <ul className="blocked-list">
              {recommendation.blockedActions.map((blocked) => (
                <li key={blocked.action}>
                  <strong>{actionLabel(blocked.action)}</strong>
                  <span>{blocked.reasonCodes.map(reasonLabel).join('; ')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              No alternative workflow is blocked by the current recommendation.
            </p>
          )}
        </section>
      </div>

      <section className="panel evidence-panel" aria-labelledby="evidence-title">
        <PanelHeading
          eyebrow="Explainability"
          title="Evidence used"
          id="evidence-title"
        />
        <div className="evidence-table" role="table">
          {recommendation.evidence.map((item) => (
            <div role="row" key={`${item.field}-${item.basis}`}>
              <span role="cell">{item.field}</span>
              <strong role="cell">{formatEvidenceValue(item.value)}</strong>
              <small role="cell">{item.basis}</small>
            </div>
          ))}
        </div>
      </section>
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
  return (
    <article className={`state-card ${tone ? `state-${tone}` : ''}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

interface PanelHeadingProps {
  eyebrow: string
  title: string
  id: string
}

export function PanelHeading({ eyebrow, title, id }: PanelHeadingProps) {
  return (
    <div className="panel-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
    </div>
  )
}
