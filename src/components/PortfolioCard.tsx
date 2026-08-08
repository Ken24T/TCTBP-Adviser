import type { PortfolioRepository } from '../../shared/portfolio'
import {
  actionLabel,
  dispositionLabel,
  formatAge,
  syncSummaryFromState,
} from '../presentation'
import type { PortfolioPreference } from '../portfolio-preferences'
import { Badge, Button, Card } from './primitives'

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

  const statusTone = tone === 'healthy' ? 'success'
    : tone === 'attention' ? 'warning'
    : tone === 'stop' ? 'danger'
    : 'neutral'

  const borderTone = tone === 'healthy' ? 'border-t-teal-500'
    : tone === 'attention' ? 'border-t-amber-500'
    : tone === 'stop' ? 'border-t-red-500'
    : 'border-t-ink-400'

  return (
    <Card className={`flex flex-col h-full gap-5 border-t-4 ${borderTone}`} hover={repository.available}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
            {repository.source === 'github-only'
              ? 'GitHub-only repository'
              : repository.available ? 'Local repository' : 'Unavailable'}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-text-primary truncate">
            {displayName}
          </h2>
          {displayName !== repository.name && (
            <small className="block text-text-faint truncate">{repository.name}</small>
          )}
        </div>
        <span className="shrink-0 mt-1" aria-hidden="true">
          <Badge tone={statusTone}>{tone}</Badge>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
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

      <div className="ad-surface-soft p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-text-muted">Recommendation</span>
          <strong className="text-text-primary text-right">{recommendationTitle(repository)}</strong>
        </div>
        <small className="block mt-1 text-text-faint">
          {repository.observedAt
            ? formatAge(Math.max(0, Date.now() - Date.parse(repository.observedAt)))
            : githubAge(repository) ?? repository.error?.message
              ?? 'No observation available'}
        </small>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{tctbpLabel(repository)}</Badge>
        <Badge tone={repository.source === 'local' ? (repository.available ? 'success' : 'warning') : 'info'}>
          {repository.source === 'local'
            ? repository.available ? 'Local evidence' : 'Partial failure'
            : 'GitHub evidence'}
        </Badge>
        {repository.upgrade && (
          <Badge tone={upgradeTone(repository.upgrade.disposition)}>
            {upgradeLabel(repository.upgrade.disposition)}
          </Badge>
        )}
      </div>

      {repository.upgrade && repository.upgrade.reasons.length > 0 && (
        <p className="text-xs text-text-muted leading-relaxed">
          {repository.upgrade.reasons.join(' · ')}
        </p>
      )}

      <div className="mt-auto pt-4 border-t border-border space-y-3">
        <label className="block text-xs text-text-muted">
          Custom name
          <input
            aria-label={`Custom name for ${repository.name}`}
            className="mt-1 w-full px-3 py-2 text-sm text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint"
            maxLength={80}
            onChange={(event) => onPreferenceChange({
              name: event.currentTarget.value,
            })}
            placeholder={repository.name}
            type="text"
            value={preference.name}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => onPreferenceChange({ pinned: !preference.pinned })}
          >
            {preference.pinned ? 'Unpin' : 'Pin'}
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => onPreferenceChange({ hidden: !preference.hidden })}
          >
            {preference.hidden ? 'Show' : 'Hide'}
          </Button>
          <Button
            disabled={!repository.available || repository.source !== 'local'}
            size="sm"
            onClick={onOpen}
          >
            {repository.source === 'local' ? 'View repository' : 'Local detail unavailable'}
          </Button>
          {githubUrl(repository) && (
            <a
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-teal-700 hover:text-teal-800 hover:bg-teal-100 transition-colors"
              href={githubUrl(repository) ?? undefined}
              rel="noreferrer"
              target="_blank"
            >
              View on GitHub
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-xs text-text-muted uppercase tracking-wider">{label}</span>
      <strong className="block text-text-primary truncate">{value}</strong>
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

function upgradeLabel(disposition: NonNullable<PortfolioRepository['upgrade']>['disposition']): string {
  if (disposition === 'current') return 'TCTBP current'
  if (disposition === 'bootstrap-required') return 'TCTBP bootstrap required'
  if (disposition === 'source-unavailable') return 'TCTBP source unavailable'
  return 'TCTBP review required'
}

function upgradeTone(disposition: NonNullable<PortfolioRepository['upgrade']>['disposition']): 'success' | 'warning' | 'info' | 'danger' {
  if (disposition === 'current') return 'success'
  if (disposition === 'bootstrap-required') return 'danger'
  if (disposition === 'source-unavailable') return 'warning'
  return 'info'
}
