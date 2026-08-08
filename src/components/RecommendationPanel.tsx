import type { RecommendationResult } from '../../shared/recommendation'
import { intentForRecommendation, intentLabel } from '../recommended-intent'
import {
  actionLabel,
  dispositionLabel,
  formatAge,
  reasonLabel,
} from '../presentation'
import { Button, Card, Panel } from './primitives'

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

  const tone = recommendation.severity === 'healthy' ? 'success'
    : recommendation.severity === 'attention' ? 'warning'
    : recommendation.severity === 'stop' ? 'danger'
    : 'neutral'

  return (
    <Panel eyebrow="State-driven recommendation" title={title}>
      <div className="flex flex-col md:flex-row md:items-start gap-4 justify-between mb-4">
        <div>
          <p className="text-sm text-text-muted">
            {dispositionLabel(recommendation.disposition)}
          </p>
          <div className="flex items-center gap-2 mt-1 text-sm text-text-muted">
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full ${
                tone === 'success' ? 'bg-teal-500'
                : tone === 'warning' ? 'bg-amber-500'
                : tone === 'danger' ? 'bg-red-500'
                : 'bg-ink-400'
              }`}
            />
            {formatAge(recommendation.freshness.ageMs)}
          </div>
        </div>
        {onReviewPlan && intentForRecommendation(recommendation.primaryAction) && (
          <Button size="sm" onClick={onReviewPlan}>
            Review {intentLabel(intentForRecommendation(recommendation.primaryAction)!)} plan
          </Button>
        )}
      </div>

      {recommendation.reasonCodes.length > 0 && (
        <div className="ad-surface-soft p-4 mb-4 rounded-lg">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-2">Reasons</h3>
          <ul className="space-y-1 text-sm text-text-secondary list-disc list-inside">
            {recommendation.reasonCodes.map((reason) => (
              <li key={reason}>{reasonLabel(reason)}</li>
            ))}
          </ul>
        </div>
      )}

      {recommendation.steps.length > 0 && (
        <div className="mb-4" aria-label="Recommended workflow">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">Recommended workflow</h3>
          <ol className="space-y-3">
            {recommendation.steps.map((step, index) => (
              <li key={`${step.action}-${index}`} className="flex items-start gap-3">
                <span className="flex-none grid w-6 h-6 text-xs font-bold place-items-center rounded-full bg-teal-100 text-teal-800">
                  {index + 1}
                </span>
                <div>
                  <strong className="block text-sm font-medium text-text-primary">{actionLabel(step.action)}</strong>
                  <small className="text-xs text-text-muted">{step.kind}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
    </Panel>
  )
}

interface EffectListProps {
  title: string
  items: string[]
  variant: 'does' | 'does-not'
}

function EffectList({ title, items, variant }: EffectListProps) {
  if (items.length === 0) return null
  const tone = variant === 'does' ? 'teal' : 'amber'
  const border = variant === 'does' ? 'border-teal-200' : 'border-amber-200'
  const bg = variant === 'does' ? 'bg-teal-50' : 'bg-amber-50'
  const text = variant === 'does' ? 'text-teal-900' : 'text-amber-900'
  return (
    <Card className={`p-4 border ${border} ${bg}`}>
      <h3 className={`text-sm font-semibold mb-2 ${text}`}>{title}</h3>
      <ul className="space-y-1.5 text-sm text-text-secondary list-disc list-inside">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </Card>
  )
}
