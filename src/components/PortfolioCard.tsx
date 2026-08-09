import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { PortfolioRepository } from '../../shared/portfolio'
import {
  actionLabel,
  dispositionLabel,
  formatAge,
  syncSummaryFromState,
} from '../presentation'
import type { PortfolioPreference } from '../portfolio-preferences'
import { cardSurfaceVars, pillSurfaceVars, severityTone } from '../card-surface'
import { useTheme } from '../theme'
import { Badge, Button, Card } from './primitives'

/** Matches the Intranet FunctionCard's FLIP_ANIMATION_DURATION (650 ms). */
const FLIP_DURATION_MS = 650

/**
 * Session-scoped last-seen tone per repository, so a card can pulse when its
 * severity changes even across portfolio remounts (e.g. returning after an
 * action refreshed the snapshot).
 */
const lastSeenTone = new Map<string, string>()

interface PortfolioCardProps {
  repository: PortfolioRepository
  preference: PortfolioPreference
  onOpen: () => void
  onPreferenceChange: (patch: Partial<PortfolioPreference>) => void
  busy?: boolean
}

export function PortfolioCard({
  repository,
  preference,
  onOpen,
  onPreferenceChange,
  busy = false,
}: PortfolioCardProps) {
  const displayName = preference.name.trim() || repository.name
  const tone = repository.source === 'github-only'
    ? repository.github.status === 'available' ? 'healthy' : 'attention'
    : repository.available
    ? repository.recommendation?.severity ?? 'attention'
    : 'stop'

  const statusTone = severityTone(tone)

  const { resolved } = useTheme()
  const isDark = resolved === 'dark'
  const surface = cardSurfaceVars(statusTone, isDark)
  const canOpen = repository.available && repository.source === 'local'
  const [flipping, setFlipping] = useState(false)
  const prevToneRef = useRef<string | null>(null)
  const [tonePulse, setTonePulse] = useState(false)

  useEffect(() => {
    const previous = prevToneRef.current ?? lastSeenTone.get(repository.id)
    prevToneRef.current = tone
    lastSeenTone.set(repository.id, tone)
    if (previous !== undefined && previous !== tone) {
      setTonePulse(true)
      const timer = window.setTimeout(() => setTonePulse(false), 700)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [repository.id, tone])

  function activate(): void {
    if (!canOpen || flipping) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onOpen()
      return
    }
    setFlipping(true)
    window.setTimeout(onOpen, FLIP_DURATION_MS)
  }

  function handleCardClick(event: MouseEvent<HTMLDivElement>): void {
    if (!canOpen || flipping) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, label')) return
    activate()
  }

  return (
    <div className="flip-card" style={surface}>
      <div
        className={[
          'flip-card-inner',
          flipping ? 'flip-card-flipped' : '',
        ].join(' ')}
      >
        <Card
          className={[
            'flip-card-face flip-card-front flex flex-col h-full gap-5 border-t-[3px] border-t-[var(--card-accent)] bg-[var(--card-surface)]',
            'shadow-[0_2px_8px_rgba(var(--card-accent-rgb),0.15),0_1px_3px_rgba(0,0,0,0.08)]',
            'hover:bg-[var(--card-surface-hover)] hover:-translate-y-1 hover:scale-[1.01]',
            'hover:shadow-[0_8px_24px_rgba(var(--card-accent-rgb),0.28),0_4px_12px_rgba(0,0,0,0.12)]',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--card-accent)]',
            preference.pinned
              ? 'border-[var(--card-accent)] shadow-[0_2px_12px_rgba(var(--card-accent-rgb),0.15)] animate-pin-pop'
              : '',
            tonePulse ? 'animate-tone-pulse' : '',
            canOpen ? 'cursor-pointer' : '',
          ].join(' ')}
          hover={false}
          onClick={handleCardClick}
        >
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
        <span
          className="inline-flex items-center gap-1.5 shrink-0 mt-1 rounded-md px-2 py-1 text-xs font-semibold bg-[var(--card-icon-bg)] text-[var(--card-icon-color)]"
        >
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[var(--card-accent)]" />
          {tone}
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

      <div className="bg-[var(--card-text-block-bg)] p-4 rounded-lg text-sm">
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
        <Badge surface style={pillSurfaceVars('neutral', isDark)}>
          {tctbpLabel(repository)}
        </Badge>
        <Badge
          surface
          style={pillSurfaceVars(
            repository.source === 'local'
              ? repository.available ? 'success' : 'warning'
              : 'info',
            isDark,
          )}
        >
          {repository.source === 'local'
            ? repository.available ? 'Local evidence' : 'Partial failure'
            : 'GitHub evidence'}
        </Badge>
        {repository.upgrade && (
          <Badge
            surface
            style={pillSurfaceVars(upgradeTone(repository.upgrade.disposition), isDark)}
          >
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
            className="mt-1 w-full px-3 py-2 text-sm text-text-primary bg-[var(--card-text-block-bg)] border border-[var(--card-btn-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint"
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
            variant="card-tertiary"
            onClick={() => onPreferenceChange({ pinned: !preference.pinned })}
          >
            {preference.pinned ? 'Unpin' : 'Pin'}
          </Button>
          <Button
            size="sm"
            variant="card-tertiary"
            onClick={() => onPreferenceChange({ hidden: !preference.hidden })}
          >
            {preference.hidden ? 'Show' : 'Hide'}
          </Button>
          <Button
            disabled={!canOpen}
            size="sm"
            variant="card-primary"
            onClick={activate}
          >
            {repository.source === 'local' ? 'View repository' : 'Local detail unavailable'}
          </Button>
          {githubUrl(repository) && (
            <a
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--card-link-text)] hover:text-[var(--card-link-hover-text)] hover:bg-[var(--card-link-hover-bg)] transition-colors"
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
        <div className="flip-card-face flip-card-back" aria-hidden="true">
          <span className="flip-card-back-dot" />
          <strong className="flip-card-back-title">
            {busy ? 'Inspecting repository…' : 'Opening repository…'}
          </strong>
          <small className="flip-card-back-sub">{displayName}</small>
        </div>
      </div>
    </div>
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
