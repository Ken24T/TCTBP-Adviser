import { useMemo, useState } from 'react'
import type {
  PortfolioRepository,
  PortfolioSnapshot,
} from '../../shared/portfolio'
import type {
  PortfolioPreference,
  PortfolioPreferences,
} from '../portfolio-preferences'
import { formatAge } from '../presentation'
import { PortfolioCard } from './PortfolioCard'

type PortfolioFilter =
  | 'all'
  | 'attention'
  | 'healthy'
  | 'non-tctbp'
  | 'tctbp-current'
  | 'tctbp-review'
  | 'tctbp-bootstrap'
  | 'tctbp-blocked'
  | 'tctbp-outdated'
  | 'tctbp-files'
  | 'tctbp-policy'

interface PortfolioDashboardProps {
  snapshot: PortfolioSnapshot
  preferences: PortfolioPreferences
  busy: boolean
  onOpen: (repositoryId: string) => void
  onRefresh: () => void
  onPreferenceChange: (
    repositoryId: string,
    patch: Partial<PortfolioPreference>,
  ) => void
}

export function PortfolioDashboard({
  snapshot,
  preferences,
  busy,
  onOpen,
  onRefresh,
  onPreferenceChange,
}: PortfolioDashboardProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PortfolioFilter>('all')
  const [showHidden, setShowHidden] = useState(false)
  const hiddenCount = snapshot.repositories.filter(
    (repository) => preferences[repository.id]?.hidden,
  ).length
  const repositories = useMemo(
    () => visibleRepositories(
      snapshot.repositories,
      preferences,
      query,
      filter,
      showHidden,
    ),
    [snapshot.repositories, preferences, query, filter, showHidden],
  )
  const healthyCount = snapshot.repositories.filter(
    (repository) => repository.recommendation?.severity === 'healthy',
  ).length
  const compatibleCount = snapshot.repositories.filter(
    (repository) => repository.tctbp?.compatible,
  ).length
  const cacheStale = snapshot.cache.ageMs > snapshot.cache.ttlMs

  return (
    <>
      <header className="portfolio-header">
        <div>
          <p className="eyebrow">Local repository registry</p>
          <h1>Repository portfolio</h1>
          <p>
            {snapshot.discovery.repositoryCount} local repositories discovered across{' '}
            {snapshot.discovery.rootCount} configured root
            {snapshot.discovery.rootCount === 1 ? '' : 's'}.
            {snapshot.github.githubOnly > 0
              ? ` ${snapshot.github.githubOnly} GitHub-only repositories added.`
              : ''}
          </p>
        </div>
        <button disabled={busy} type="button" onClick={onRefresh}>
          {busy ? 'Refreshing…' : 'Refresh portfolio'}
        </button>
      </header>

      <section className="portfolio-metrics" aria-label="Portfolio summary">
        <Metric label="Discovered" value={snapshot.discovery.repositoryCount} />
        <Metric label="Healthy" value={healthyCount} />
        <Metric label="TCTBP compatible" value={compatibleCount} />
        <Metric label="GitHub mapped" value={snapshot.github.localMappings} />
        {snapshot.upgrade?.enabled && (
          <>
            <Metric label="TCTBP current" value={snapshot.upgrade.current} />
            <Metric label="TCTBP review" value={snapshot.upgrade.reviewRequired} />
            <Metric label="TCTBP bootstrap" value={snapshot.upgrade.bootstrapRequired} />
            <Metric label="TCTBP blocked" value={snapshot.upgrade.blocked} />
          </>
        )}
      </section>

      <section className="portfolio-controls" aria-label="Portfolio filters">
        <label className="portfolio-search">
          <span>Search repositories</span>
          <input
            type="search"
            placeholder="Search by repository or custom name"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <div className="filter-buttons">
          {filterOptions(snapshot).map((option) => (
            <button
              className={filter === option ? 'selected' : ''}
              key={option}
              type="button"
              onClick={() => setFilter(option)}
            >
              {filterLabel(option)}
            </button>
          ))}
          {hiddenCount > 0 && (
            <button type="button" onClick={() => setShowHidden(!showHidden)}>
              {showHidden ? 'Hide hidden' : `Show hidden (${hiddenCount})`}
            </button>
          )}
        </div>
      </section>

      <div className={`portfolio-cache-note ${cacheStale ? 'cache-stale' : ''}`}>
        <span className="status-dot" aria-hidden="true" />
        {cacheStale
          ? 'Stale portfolio'
          : snapshot.cache.status === 'fresh'
            ? 'Cached portfolio'
            : 'Freshly inspected'}
        {' · '}{formatAge(snapshot.cache.ageMs)} · No Git fetch performed
      </div>

      {repositories.length > 0 ? (
        <section className="portfolio-grid" aria-label="Repositories">
          {repositories.map((repository) => (
            <PortfolioCard
              key={repository.id}
              repository={repository}
              preference={preferences[repository.id] ?? emptyPreference()}
              onOpen={() => onOpen(repository.id)}
              onPreferenceChange={(patch) => (
                onPreferenceChange(repository.id, patch)
              )}
            />
          ))}
        </section>
      ) : (
        <section className="portfolio-empty">
          <p className="eyebrow">No matches</p>
          <h2>No repositories match the current view.</h2>
          <p>Adjust the search, filter, or hidden-repository setting.</p>
        </section>
      )}

      {snapshot.discovery.issues.length > 0 && (
        <section className="discovery-issues" aria-labelledby="issues-title">
          <p className="eyebrow">Partial discovery</p>
          <h2 id="issues-title">Some locations were skipped safely</h2>
          <ul>
            {snapshot.discovery.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function visibleRepositories(
  repositories: PortfolioRepository[],
  preferences: PortfolioPreferences,
  query: string,
  filter: PortfolioFilter,
  showHidden: boolean,
): PortfolioRepository[] {
  const needle = query.trim().toLocaleLowerCase()
  return repositories.filter((repository) => {
    const preference = preferences[repository.id]
    if (preference?.hidden && !showHidden) return false
    const name = `${repository.name} ${preference?.name ?? ''}`
      .toLocaleLowerCase()
    return name.includes(needle) && matchesFilter(repository, filter)
  }).sort((left, right) => {
    const pinDifference = Number(preferences[right.id]?.pinned ?? false)
      - Number(preferences[left.id]?.pinned ?? false)
    if (pinDifference !== 0) return pinDifference
    return displayName(left, preferences).localeCompare(
      displayName(right, preferences),
    )
  })
}

function matchesFilter(
  repository: PortfolioRepository,
  filter: PortfolioFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'non-tctbp') return repository.tctbp?.installed === false
  if (filter === 'healthy') {
    return repository.recommendation?.severity === 'healthy'
  }
  if (filter === 'attention') {
    return (
      !repository.available
      || repository.recommendation?.severity !== 'healthy'
    )
  }
  if (!repository.upgrade) return false
  if (filter === 'tctbp-current') {
    return repository.upgrade.disposition === 'current'
  }
  if (filter === 'tctbp-review') {
    return repository.upgrade.disposition === 'review-required'
  }
  if (filter === 'tctbp-bootstrap') {
    return repository.upgrade.disposition === 'bootstrap-required'
  }
  if (filter === 'tctbp-blocked') {
    return repository.upgrade.blockerCount > 0
  }
  if (filter === 'tctbp-outdated') {
    return repository.upgrade.sourceAlignment === 'outdated'
  }
  if (filter === 'tctbp-files') {
    return repository.upgrade.actionCounts.add > 0
      || repository.upgrade.actionCounts.review > 0
  }
  return repository.upgrade.policyDifferenceCount > 0
}

function filterOptions(snapshot: PortfolioSnapshot): PortfolioFilter[] {
  const options: PortfolioFilter[] = ['all', 'attention', 'healthy', 'non-tctbp']
  if (snapshot.upgrade?.enabled) {
    options.push(
      'tctbp-current',
      'tctbp-review',
      'tctbp-bootstrap',
      'tctbp-blocked',
      'tctbp-outdated',
      'tctbp-files',
      'tctbp-policy',
    )
  }
  return options
}

function displayName(
  repository: PortfolioRepository,
  preferences: PortfolioPreferences,
): string {
  return preferences[repository.id]?.name.trim() || repository.name
}

function emptyPreference(): PortfolioPreference {
  return { pinned: false, hidden: false, name: '' }
}

function filterLabel(filter: PortfolioFilter): string {
  const labels: Record<PortfolioFilter, string> = {
    all: 'All',
    attention: 'Attention',
    healthy: 'Healthy',
    'non-tctbp': 'Without TCTBP',
    'tctbp-current': 'TCTBP current',
    'tctbp-review': 'TCTBP review',
    'tctbp-bootstrap': 'Bootstrap required',
    'tctbp-blocked': 'TCTBP blocked',
    'tctbp-outdated': 'Source outdated',
    'tctbp-files': 'File changes',
    'tctbp-policy': 'Policy drift',
  }
  return labels[filter]
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
