import type { RecommendationIntent } from '../../shared/recommendation'
import type { RepositoryDetailResult } from '../../shared/repository-detail'
import type { TctbpUpgradePlan } from '../../shared/tctbp-upgrade'
import { RecommendationPanel } from './RecommendationPanel'
import { RepositoryState } from './RepositoryState'
import { TctbpPanel } from './TctbpPanel'
import { GitHubPanel } from './GitHubPanel'
import { IntentPlanPanel } from './IntentPlanPanel'
import { INTENT_OPTIONS } from '../intent-options'
import { RepositoryReferencePanel } from './RepositoryReferencePanel'
import { TctbpUpgradePanel } from './TctbpUpgradePanel'

interface RepositoryDetailProps {
  detail: RepositoryDetailResult
  intent: RecommendationIntent
  busy: boolean
  upgradePlan: TctbpUpgradePlan | null
  upgradeBusy: boolean
  onBack?: () => void
  onIntentChange: (intent: RecommendationIntent) => void
  onRefresh: () => void
  onLoadUpgradePlan: () => void
}

export function RepositoryDetail({
  detail,
  intent,
  busy,
  upgradePlan,
  upgradeBusy,
  onBack,
  onIntentChange,
  onRefresh,
  onLoadUpgradePlan,
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
          <label className="intent-select">
            <span>Selected outcome</span>
            <select
              disabled={busy}
              value={intent}
              onChange={(event) => onIntentChange(
                event.currentTarget.value as RecommendationIntent,
              )}
            >
              {INTENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
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
      <IntentPlanPanel plan={detail.intentPlan} />
      <RepositoryState
        observation={observation}
        recommendation={recommendation}
      />
      <TctbpPanel observation={observation} />
      <TctbpUpgradePanel
        plan={upgradePlan}
        busy={upgradeBusy}
        onLoad={onLoadUpgradePlan}
      />
      <RepositoryReferencePanel reference={detail.reference} />
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
