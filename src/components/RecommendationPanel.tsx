import type { RecommendationResult } from '../../shared/recommendation'
import { formatAge, reasonLabel } from '../presentation'
import { Card } from './primitives'

interface RecommendationPanelProps {
  recommendation: RecommendationResult
}

/**
 * Compact, informational strip explaining *why* the state-driven
 * recommendation exists. Deliberately de-emphasised: the plan panel above it
 * owns the workflow steps and run buttons; this only adds the reasons and the
 * "what this action does / does not do" reassurance.
 */
export function RecommendationPanel({
  recommendation,
}: RecommendationPanelProps) {
  const tone = recommendation.severity === 'healthy' ? 'bg-teal-500'
    : recommendation.severity === 'attention' ? 'bg-amber-500'
    : recommendation.severity === 'stop' ? 'bg-red-500'
    : 'bg-ink-400'

  return (
    <div className="ad-surface-soft rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
          Why this is recommended
        </h3>
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          <span aria-hidden="true" className={`w-2 h-2 rounded-full ${tone}`} />
          {formatAge(recommendation.freshness.ageMs)}
        </span>
      </div>

      {recommendation.reasonCodes.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {recommendation.reasonCodes.map((reason) => (
            <li
              className="px-2 py-1 text-xs rounded-full bg-surface-inset border border-border text-text-secondary"
              key={reason}
            >
              {reasonLabel(reason)}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
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
    </div>
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
