import type { RecommendationIntent } from '../../shared/recommendation'
import type { RepositoryDetailResult } from '../../shared/repository-detail'
import { RecommendationPanel } from './RecommendationPanel'
import { RepositoryState } from './RepositoryState'
import { TctbpPanel } from './TctbpPanel'
import { GitHubPanel } from './GitHubPanel'

interface RepositoryDetailProps {
  detail: RepositoryDetailResult
  intent: RecommendationIntent
  busy: boolean
  onBack?: () => void
  onIntentChange: (intent: RecommendationIntent) => void
  onRefresh: () => void
}

export function RepositoryDetail({
  detail,
  intent,
  busy,
  onBack,
  onIntentChange,
  onRefresh,
}: RepositoryDetailProps) {
  const { observation, recommendation } = detail
  return (
    <>
      <header className="repository-header">
        <div>
          {onBack && (
            <button className="back-button" type="button" onClick={onBack}>
              ← Portfolio
            </button>
          )}
          <p className="eyebrow">Configured local repository</p>
          <h1>{observation.repository.name}</h1>
          <p className="repository-description">
            {observation.tctbp.projectDescription
              ?? 'No project description is available in the TCTBP profile.'}
          </p>
        </div>
        <div className="trust-badges" aria-label="Inspection properties">
          <span>Local evidence</span>
          <span>Read-only</span>
          <span>Deterministic</span>
        </div>
      </header>

      <section className="intent-bar" aria-labelledby="intent-title">
        <div>
          <p className="eyebrow">Intent adviser</p>
          <h2 id="intent-title">What are you trying to do?</h2>
        </div>
        <div className="intent-actions">
          <button
            className={intent === 'none' ? 'selected' : ''}
            disabled={busy}
            onClick={() => onIntentChange('none')}
            type="button"
          >
            Check repository health
          </button>
          <button
            className={intent === 'continue-on-another-machine' ? 'selected' : ''}
            disabled={busy}
            onClick={() => onIntentChange('continue-on-another-machine')}
            type="button"
          >
            Continue on another machine
          </button>
          <button
            className="refresh-button"
            disabled={busy}
            onClick={onRefresh}
            type="button"
          >
            {busy ? 'Inspecting…' : 'Refresh'}
          </button>
        </div>
      </section>

      <RecommendationPanel recommendation={recommendation} />
      <RepositoryState
        observation={observation}
        recommendation={recommendation}
      />
      <TctbpPanel observation={observation} />
      <GitHubPanel
        evidence={detail.github}
        localBranch={observation.head.branch}
        localSha={observation.head.sha}
      />

      <section className="uncertainties" aria-labelledby="uncertainty-title">
        <p className="eyebrow">Known limits</p>
        <h2 id="uncertainty-title">What this inspection cannot prove</h2>
        <ul>
          {recommendation.uncertainties.map((issue) => (
            <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
          ))}
          {observation.tctbp.scaffold.uncertainties.map((message) => (
            <li key={message}>{message}</li>
          ))}
          <li>
            No fetch was performed. Remote comparisons use locally cached
            tracking refs and may not reflect current GitHub state.
          </li>
        </ul>
      </section>
    </>
  )
}
