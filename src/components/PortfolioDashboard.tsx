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
import { Card, EmptyState, Section } from './primitives'
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
  query: string
  busy?: boolean
  onOpen: (repositoryId: string) => void
  onPreferenceChange: (
    repositoryId: string,
    patch: Partial<PortfolioPreference>,
  ) => void
}

export function PortfolioDashboard({
  snapshot,
  preferences,
  query,
  busy = false,
  onOpen,
  onPreferenceChange,
}: PortfolioDashboardProps) {
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
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col lg:flex-row lg:items-end gap-6 justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-teal-600">Local repository registry</p>
          <h1 className="mt-1 text-5xl font-semibold text-text-primary tracking-tight">Repository portfolio</h1>
          <p className="mt-3 text-lg text-text-secondary leading-relaxed">
            {snapshot.discovery.repositoryCount} local repositories discovered across{' '}
            {snapshot.discovery.rootCount} configured root
            {snapshot.discovery.rootCount === 1 ? '' : 's'}.
            {snapshot.github.githubOnly > 0
              ? ` ${snapshot.github.githubOnly} GitHub-only repositories added.`
              : ''}
          </p>
        </div>
      </header>

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <MetricChip
            label="Discovered"
            value={snapshot.discovery.repositoryCount}
            tone="info"
            note={`${snapshot.discovery.rootCount} configured root${snapshot.discovery.rootCount === 1 ? '' : 's'}`}
          />
          <MetricChip label="Healthy" value={healthyCount} tone="success" note="No action needed" />
          <MetricChip label="TCTBP compatible" value={compatibleCount} tone="accent" note="Ready for advice" />
          <MetricChip label="GitHub mapped" value={snapshot.github.localMappings} tone="neutral" />
          {snapshot.upgrade?.enabled && (
            <>
              <MetricChip label="TCTBP current" value={snapshot.upgrade.current} tone="success" />
              <MetricChip label="TCTBP review" value={snapshot.upgrade.reviewRequired} tone="warning" />
              <MetricChip label="TCTBP bootstrap" value={snapshot.upgrade.bootstrapRequired} tone="danger" />
              <MetricChip label="TCTBP blocked" value={snapshot.upgrade.blocked} tone="danger" />
            </>
          )}
          <div className="flex items-center gap-2 text-xs text-text-muted ml-auto">
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full ${cacheStale ? 'bg-amber-500' : 'bg-teal-500'}`}
            />
            <span>
              {cacheStale
                ? 'Stale portfolio'
                : snapshot.cache.status === 'fresh'
                  ? 'Cached portfolio'
                  : 'Freshly inspected'}
              {' · '}{formatAge(snapshot.cache.ageMs)} · No Git fetch performed
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border">
          {filterOptions(snapshot).map((option) => (
            <button
              className={[
                'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
                filter === option
                  ? 'bg-teal-600 text-white shadow-soft'
                  : 'bg-surface-soft text-text-secondary hover:bg-surface-hover border border-border',
              ].join(' ')}
              key={option}
              type="button"
              onClick={() => setFilter(option)}
            >
              {filterLabel(option)}
            </button>
          ))}
          {hiddenCount > 0 && (
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-butter-100 text-ink-900 hover:bg-butter-200 transition-colors border border-butter-300"
              type="button"
              onClick={() => setShowHidden(!showHidden)}
            >
              {showHidden ? 'Hide hidden' : `Show hidden (${hiddenCount})`}
            </button>
          )}
        </div>
      </Card>

      {repositories.length > 0 ? (
        <Section
          eyebrow={`${repositories.length} matching`}
          title={filterLabel(filter)}
        >
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6" aria-label="Repositories">
            {repositories.map((repository) => (
              <PortfolioCard
                busy={busy}
                key={repository.id}
                repository={repository}
                preference={preferences[repository.id] ?? emptyPreference()}
                onOpen={() => onOpen(repository.id)}
                onPreferenceChange={(patch) => (
                  onPreferenceChange(repository.id, patch)
                )}
              />
            ))}
          </div>
        </Section>
      ) : (
        <EmptyState
          eyebrow="No matches"
          title="No repositories match the current view."
          description="Adjust the search, filter, or hidden-repository setting."
        />
      )}

      {snapshot.discovery.issues.length > 0 && (
        <Section eyebrow="Partial discovery" title="Some locations were skipped safely">
          <ul className="ad-surface-soft p-5 space-y-2 text-sm text-text-secondary list-disc list-inside">
            {snapshot.discovery.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
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

type MetricTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

function MetricChip({
  label,
  value,
  tone = 'neutral',
  note,
}: {
  label: string
  value: number
  tone?: MetricTone
  note?: string
}) {
  const dotClasses: Record<MetricTone, string> = {
    neutral: 'bg-ink-400',
    success: 'bg-teal-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    info: 'bg-blue-500',
    accent: 'bg-teal-600',
  }
  return (
    <span className="inline-flex items-center gap-2" title={note}>
      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${dotClasses[tone]}`} />
      <strong className="text-lg font-semibold text-text-primary tabular-nums">{value}</strong>
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
      {note ? <span className="text-xs text-text-faint">· {note}</span> : null}
    </span>
  )
}


