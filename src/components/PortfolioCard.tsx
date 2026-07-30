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
  const tone = repository.source === 'github-only'
    ? repository.github.status === 'available' ? 'healthy' : 'attention'
    : repository.available
    ? repository.recommendation?.severity ?? 'attention'
    : 'stop'
  return (
    <article className={`portfolio-card portfolio-${tone}`}>
      <div className="portfolio-card-top">
        <div>
          <p className="eyebrow">
            {repository.source === 'github-only'
              ? 'GitHub-only repository'
              : repository.available ? 'Local repository' : 'Unavailable'}
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
            ?? githubBranch(repository)
            ?? (repository.head?.detached ? 'Detached HEAD' : 'Unavailable')}
        />
        <Fact
          label="Working tree"
          value={repository.workingTree
            ? repository.workingTree.clean
              ? 'Clean'
              : `${repository.workingTree.pathCount} changed paths`
            : repository.source === 'github-only'
              ? 'No local working copy'
              : 'Unavailable'}
        />
        <Fact
          label="Tracking"
          value={repository.localTracking
            ? syncSummaryFromState(repository.localTracking)
            : repository.source === 'github-only'
              ? 'Provider evidence only'
              : 'Unavailable'}
        />
      </div>

      <div className="portfolio-recommendation">
        <span>Recommendation</span>
        <strong>{recommendationTitle(repository)}</strong>
        <small>{repository.observedAt
          ? formatAge(Math.max(0, Date.now() - Date.parse(repository.observedAt)))
          : githubAge(repository) ?? repository.error?.message
            ?? 'No observation available'}</small>
      </div>

      <div className="portfolio-badges">
        <span>{tctbpLabel(repository)}</span>
        <span>{repository.source === 'local'
          ? repository.available ? 'Local evidence' : 'Partial failure'
          : 'GitHub evidence'}</span>
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
          disabled={!repository.available || repository.source !== 'local'}
          type="button"
          onClick={onOpen}
        >
          {repository.source === 'local' ? 'View repository' : 'Local detail unavailable'}
        </button>
        {githubUrl(repository) && (
          <a
            className="github-link"
            href={githubUrl(repository) ?? undefined}
            rel="noreferrer"
            target="_blank"
          >
            View on GitHub
          </a>
        )}
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
  if (repository.source === 'github-only') {
    return repository.github.status === 'available'
      ? 'Local recommendation unavailable'
      : 'GitHub evidence unavailable'
  }
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

function githubBranch(repository: PortfolioRepository): string | null {
  return repository.github.status === 'available'
    ? repository.github.repository.defaultBranch
    : null
}

function githubAge(repository: PortfolioRepository): string | null {
  const retrievedAt = repository.github.retrievedAt
  return retrievedAt
    ? `GitHub retrieved ${formatAge(
      Math.max(0, Date.now() - Date.parse(retrievedAt)),
    )}`
    : null
}

function githubUrl(repository: PortfolioRepository): string | null {
  return repository.github.status === 'available'
    ? repository.github.repository.htmlUrl
    : null
}

function tctbpLabel(repository: PortfolioRepository): string {
  if (!repository.tctbp) return 'TCTBP unknown'
  if (!repository.tctbp.installed) return 'TCTBP not installed'
  if (!repository.tctbp.compatible) return 'TCTBP incompatible'
  return `TCTBP schema ${repository.tctbp.schemaVersion ?? 'unknown'}`
}
