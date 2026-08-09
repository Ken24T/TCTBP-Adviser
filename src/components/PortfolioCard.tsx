import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { PortfolioRepository } from '../../shared/portfolio'
import { actionLabel, dispositionLabel } from '../presentation'
import type { PortfolioPreference } from '../portfolio-preferences'
import { cardSurfaceVars, severityTone } from '../card-surface'
import { useTheme } from '../theme'
import { Button, Card } from './primitives'
import { PortfolioCardMenu } from './PortfolioCardMenu'

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
  onRefresh: () => void
  busy?: boolean
  startFlipped?: boolean
}

export function PortfolioCard({
  repository,
  preference,
  onOpen,
  onPreferenceChange,
  onRefresh,
  busy = false,
  startFlipped = false,
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
  const faviconUrl = repository.faviconPath
    ? `/api/repositories/${repository.id}/favicon`
    : repository.github.status === 'available'
      ? repository.github.repository.ownerAvatarUrl
      : null
  const [flipping, setFlipping] = useState(startFlipped)
  const [flipDirection, setFlipDirection] = useState<'forward' | 'return' | null>(
    startFlipped ? 'return' : null,
  )
  const [renaming, setRenaming] = useState(false)
  const prevToneRef = useRef<string | null>(null)
  const [tonePulse, setTonePulse] = useState(false)

  useEffect(() => {
    if (!startFlipped) return
    // Mount flipped (back face showing) and rotate back to the front so the
    // return to the dashboard animates the card closing, mirroring the open.
    const timer = window.setTimeout(() => setFlipping(false), 150)
    return () => window.clearTimeout(timer)
  }, [startFlipped])

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
    setFlipDirection('forward')
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
            'hover:bg-[var(--card-surface-hover)]',
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
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {faviconUrl && (
            <img
              alt=""
              className="w-8 h-8 rounded-full shrink-0 mt-0.5"
              src={faviconUrl}
            />
          )}
          <div className="min-w-0">
            {(repository.source === 'github-only' || !repository.available) && (
              <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
                {repository.source === 'github-only'
                  ? 'GitHub-only repository'
                  : 'Unavailable'}
              </p>
            )}
            <h2 className="mt-1 text-xl font-semibold text-text-primary truncate">
              {displayName}
            </h2>
            {repository.directoryName && repository.directoryName !== displayName && (
              <small className="block text-text-faint truncate">{repository.directoryName}</small>
            )}
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold bg-[var(--card-icon-bg)] text-[var(--card-icon-color)]">
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[var(--card-accent)]" />
              {tone}
            </span>
          </div>
        </div>
        <div className="shrink-0 mt-1">
          <PortfolioCardMenu
            canOpen={canOpen}
            canRefresh={repository.source === 'local'}
            githubUrl={githubUrl(repository)}
            hidden={preference.hidden}
            onOpen={activate}
            onRefresh={onRefresh}
            onRename={() => setRenaming(true)}
            onToggleHide={() => onPreferenceChange({ hidden: !preference.hidden })}
            onTogglePin={() => onPreferenceChange({ pinned: !preference.pinned })}
            pinned={preference.pinned}
            repositoryName={repository.name}
            sourceStatus={repository.source === 'local'
              ? repository.available ? 'Local evidence' : 'Partial failure'
              : 'GitHub evidence'}
            sourceTone={repository.source === 'local'
              ? repository.available ? 'success' : 'warning'
              : 'info'}
            tctbpStatus={tctbpLabel(repository)}
            upgradeReasons={repository.upgrade?.reasons ?? []}
            upgradeStatus={repository.upgrade
              ? upgradeLabel(repository.upgrade.disposition)
              : null}
            upgradeTone={repository.upgrade
              ? upgradeTone(repository.upgrade.disposition)
              : null}
          />
        </div>
      </div>

      <div className="mt-auto bg-[var(--card-text-block-bg)] p-4 rounded-lg text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-text-muted">Recommended</span>
          <strong className="text-text-primary text-right">{recommendationTitle(repository)}</strong>
        </div>
      </div>

      {renaming && (
        <RenameRow
          name={preference.name}
          onCancel={() => setRenaming(false)}
          onSave={(nextName) => {
            onPreferenceChange({ name: nextName })
            setRenaming(false)
          }}
          placeholder={repository.name}
        />
      )}
        </Card>
        <div className="flip-card-face flip-card-back" aria-hidden="true">
          <span className="flip-card-back-dot" />
          <strong className="flip-card-back-title">
            {flipDirection === 'return'
              ? 'Returning to portfolio…'
              : busy ? 'Inspecting repository…' : 'Opening repository…'}
          </strong>
          <small className="flip-card-back-sub">{displayName}</small>
        </div>
      </div>
    </div>
  )
}

function RenameRow({
  name,
  placeholder,
  onSave,
  onCancel,
}: {
  name: string
  placeholder: string
  onSave: (nextName: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(name)
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label="Custom repository name"
        autoFocus
        className="flex-1 min-w-0 px-3 py-2 text-sm text-text-primary bg-[var(--card-text-block-bg)] border border-[var(--card-btn-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint"
        maxLength={80}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSave(value)
          if (event.key === 'Escape') onCancel()
        }}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      <Button size="sm" variant="card-primary" onClick={() => onSave(value)}>
        Save
      </Button>
      <Button size="sm" variant="card-tertiary" onClick={onCancel}>
        Cancel
      </Button>
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
