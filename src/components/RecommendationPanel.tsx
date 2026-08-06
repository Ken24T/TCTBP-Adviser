import type { RecommendationResult } from '../../shared/recommendation'
import { intentForRecommendation, intentLabel } from '../recommended-intent'
import {
  actionLabel,
  dispositionLabel,
  formatAge,
  reasonLabel,
} from '../presentation'

interface RecommendationPanelProps {
  recommendation: RecommendationResult
  onReviewPlan?: () => void
}

export function RecommendationPanel({
  recommendation,
  onReviewPlan,
}: RecommendationPanelProps) {
  const title = recommendation.primaryAction
    ? actionLabel(recommendation.primaryAction)
    : dispositionLabel(recommendation.disposition)

  return (
    <section
      className={`recommendation tone-${recommendation.severity}`}
      aria-labelledby="recommendation-title"
    >
      <div className="recommendation-heading">
        <div>
          <p className="eyebrow">State-driven recommendation</p>
          <p className="recommendation-disposition">
            {dispositionLabel(recommendation.disposition)}
          </p>
          <h2 id="recommendation-title">{title}</h2>
        </div>
        <div className="freshness">
          <span className="status-dot" aria-hidden="true" />
          {formatAge(recommendation.freshness.ageMs)}
        </div>
      </div>

      <div className="reason-list">
        {recommendation.reasonCodes.map((reason) => (
          <p key={reason}>{reasonLabel(reason)}</p>
        ))}
      </div>

      {recommendation.trigger && (
        <div className="trigger">
          <span>Suggested TCTBP trigger</span>
          <code>{recommendation.trigger}</code>
        </div>
      )}

      {onReviewPlan && intentForRecommendation(recommendation.primaryAction) && (
        <button className="review-plan-button" type="button" onClick={onReviewPlan}>
          Review {intentLabel(intentForRecommendation(recommendation.primaryAction)!)} plan
        </button>
      )}

      {recommendation.steps.length > 0 && (
        <div className="workflow" aria-label="Recommended workflow">
          {recommendation.steps.map((step, index) => (
            <div className="workflow-step" key={`${step.action}-${index}`}>
              <span>{index + 1}</span>
              <div>
                <strong>{actionLabel(step.action)}</strong>
                <small>{step.kind}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="effects-grid">
        <EffectList
          title="What this action does"
          items={recommendation.effects.does}
          variant="does"
        />
        <EffectList
          title="What this action does not do"
          items={recommendation.effects.doesNot}
          variant="does-not"
        />
      </div>
    </section>
  )
}

interface EffectListProps {
  title: string
  items: string[]
  variant: 'does' | 'does-not'
}

function EffectList({ title, items, variant }: EffectListProps) {
  if (items.length === 0) return null
  return (
    <div className={`effect-list ${variant}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}
