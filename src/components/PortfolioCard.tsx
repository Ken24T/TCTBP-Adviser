import type { PortfolioRepository } from '../../shared/portfolio'
import {
  actionLabel,
  dispositionLabel,
  formatAge,
  syncSummaryFromState,
} from '../presentation'
import type { PortfolioPreference } from '../portfolio-preferences'

interface PortfolioCardProps {
  repository: PortfolioRepository
  preference: PortfolioPreference
  onOpen: () => void
  onPreferenceChange: (patch: Partial<PortfolioPreference>) => void
}

export function PortfolioCard({
  repository,
  preference,
  onOpen,
  onPreferenceChange,
}: PortfolioCardProps) {
  const displayName = preference.name.trim() || repository.name
  const tone = repository.available
    ? repository.recommendation?.severity ?? 'attention'
    : 'stop'
  return (
    <article className={`portfolio-card portfolio-${tone}`}>
      <div className="portfolio-card-top">
        <div>
          <p className="eyebrow">
            {repository.available ? 'Local repository' : 'Unavailable'}
          </p>
          <h2>{displayName}</h2>
          {displayName !== repository.name && (
            <small className="original-name">{repository.name}</small>
          )}
        </div>
        <span className={`health-marker health-${tone}`} aria-hidden="true" />
      </div>

      <div className="portfolio-facts">
        <Fact
          label="Branch"
          value={repository.head?.branch
            ?? (repository.head?.detached ? 'Detached HEAD' : 'Unavailable')}
        />
        <Fact
          label="Working tree"
          value={repository.workingTree
            ? repository.workingTree.clean
              ? 'Clean'
              : `${repository.workingTree.pathCount} changed paths`
            : 'Unavailable'}
        />
        <Fact
          label="Tracking"
          value={repository.localTracking
            ? syncSummaryFromState(repository.localTracking)
            : 'Unavailable'}
        />
      </div>

      <div className="portfolio-recommendation">
        <span>Recommendation</span>
        <strong>{recommendationTitle(repository)}</strong>
        <small>{repository.observedAt
          ? formatAge(Math.max(0, Date.now() - Date.parse(repository.observedAt)))
          : repository.error?.message ?? 'No observation available'}</small>
      </div>

      <div className="portfolio-badges">
        <span>{tctbpLabel(repository)}</span>
        <span>{repository.available ? 'Local evidence' : 'Partial failure'}</span>
      </div>

      <label className="rename-control">
        <span>Custom name</span>
        <input
          aria-label={`Custom name for ${repository.name}`}
          maxLength={80}
          onChange={(event) => onPreferenceChange({
            name: event.currentTarget.value,
          })}
          placeholder={repository.name}
          type="text"
          value={preference.name}
        />
      </label>

      <div className="portfolio-card-actions">
        <button
          type="button"
          onClick={() => onPreferenceChange({ pinned: !preference.pinned })}
        >
          {preference.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          type="button"
          onClick={() => onPreferenceChange({ hidden: !preference.hidden })}
        >
          {preference.hidden ? 'Show' : 'Hide'}
        </button>
        <button
          className="open-repository"
          disabled={!repository.available}
          type="button"
          onClick={onOpen}
        >
          View repository
        </button>
      </div>
    </article>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function recommendationTitle(repository: PortfolioRepository): string {
  if (!repository.available) return 'Inspection unavailable'
  const recommendation = repository.recommendation
  if (!recommendation) return 'Recommendation unavailable'
  if (recommendation.reasonCodes.includes('tctbp-not-installed')) {
    return 'Install TCTBP'
  }
  if (recommendation.reasonCodes.includes('tctbp-contract-incompatible')) {
    return 'Review TCTBP compatibility'
  }
  return recommendation.primaryAction
    ? actionLabel(recommendation.primaryAction)
    : dispositionLabel(recommendation.disposition)
}

function tctbpLabel(repository: PortfolioRepository): string {
  if (!repository.tctbp) return 'TCTBP unknown'
  if (!repository.tctbp.installed) return 'TCTBP not installed'
  if (!repository.tctbp.compatible) return 'TCTBP incompatible'
  return `TCTBP schema ${repository.tctbp.schemaVersion ?? 'unknown'}`
}
