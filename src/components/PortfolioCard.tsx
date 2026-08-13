import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { PortfolioRepository } from '../../shared/portfolio'
import {
  portfolioTone,
  recommendationTitle,
  tctbpLabel,
  upgradeLabel,
} from '../presentation'
import type { PortfolioPreference } from '../portfolio-preferences'
import { cardSurfaceVars, severityTone } from '../card-surface'
import { useTheme } from '../theme'
import { Button, Card } from './primitives'
import { CardCallout, type CardCalloutPlacement } from './CardCallout'
import { PortfolioCardMenu } from './PortfolioCardMenu'
import { RefreshIcon } from './icons'

/** Matches the Intranet FunctionCard's FLIP_ANIMATION_DURATION (650 ms). */
const FLIP_DURATION_MS = 650

/** Width of the hover callout, used to pick which side it fits on. */
const CALLOUT_WIDTH_PX = 288
/** Rough callout height used to keep it inside the viewport. */
const CALLOUT_HEIGHT_ESTIMATE_PX = 320
/** Gap between the card and its callout. */
const CALLOUT_GAP_PX = 8
/** Wait before showing the callout so a quick mouse pass doesn't flash it. */
const CALLOUT_OPEN_DELAY_MS = 300
/** Allow crossing the gap between card and callout without closing. */
const CALLOUT_CLOSE_DELAY_MS = 180

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
  refreshing?: boolean
  startFlipped?: boolean
}

export function PortfolioCard({
  repository,
  preference,
  onOpen,
  onPreferenceChange,
  onRefresh,
  busy = false,
  refreshing = false,
  startFlipped = false,
}: PortfolioCardProps) {
  const displayName = preference.name.trim() || repository.name
  const tone = portfolioTone(repository)

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
  const [calloutOpen, setCalloutOpen] = useState(false)
  const [calloutPlacement, setCalloutPlacement] = useState<CardCalloutPlacement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const calloutCloseTimerRef = useRef<number | null>(null)
  const calloutOpenTimerRef = useRef<number | null>(null)
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

  useEffect(() => () => {
    if (calloutCloseTimerRef.current !== null) {
      window.clearTimeout(calloutCloseTimerRef.current)
    }
    if (calloutOpenTimerRef.current !== null) {
      window.clearTimeout(calloutOpenTimerRef.current)
    }
  }, [])

  /**
   * Chooses which side of the card the callout should sit on (preferring the
   * side with room in the viewport) and returns viewport coordinates so the
   * portaled callout can render beside the card without covering it.
   */
  function computeCalloutPlacement(): CardCalloutPlacement | null {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const rightSpace = window.innerWidth - rect.right - CALLOUT_GAP_PX
    const leftSpace = rect.left - CALLOUT_GAP_PX
    const side: 'left' | 'right' = rightSpace >= CALLOUT_WIDTH_PX
      ? 'right'
      : leftSpace >= CALLOUT_WIDTH_PX
        ? 'left'
        : rightSpace >= leftSpace
          ? 'right'
          : 'left'
    const left = side === 'right'
      ? Math.min(
          rect.right + CALLOUT_GAP_PX,
          window.innerWidth - CALLOUT_WIDTH_PX - CALLOUT_GAP_PX,
        )
      : Math.max(CALLOUT_GAP_PX, rect.left - CALLOUT_WIDTH_PX - CALLOUT_GAP_PX)
    const overhang = rect.top + CALLOUT_HEIGHT_ESTIMATE_PX + CALLOUT_GAP_PX - window.innerHeight
    const top = Math.max(CALLOUT_GAP_PX, rect.top - Math.max(0, overhang))
    return { left, top }
  }

  /** Cancel a pending (not yet shown) callout open. */
  function cancelPendingOpen(): void {
    if (calloutOpenTimerRef.current !== null) {
      window.clearTimeout(calloutOpenTimerRef.current)
      calloutOpenTimerRef.current = null
    }
  }

  /** Show the callout immediately (keyboard focus, or mouse already over it). */
  function openCallout(): void {
    cancelPendingOpen()
    if (calloutCloseTimerRef.current !== null) {
      window.clearTimeout(calloutCloseTimerRef.current)
      calloutCloseTimerRef.current = null
    }
    if (!calloutOpen) {
      setCalloutPlacement(computeCalloutPlacement())
      setCalloutOpen(true)
    }
  }

  /** Show the callout after a short delay so a quick mouse pass doesn't flash it. */
  function scheduleOpenCallout(): void {
    if (calloutOpen || calloutOpenTimerRef.current !== null) return
    calloutOpenTimerRef.current = window.setTimeout(() => {
      calloutOpenTimerRef.current = null
      openCallout()
    }, CALLOUT_OPEN_DELAY_MS)
  }

  /** Close after a short delay so moving across the gap stays open. */
  function scheduleCloseCallout(): void {
    cancelPendingOpen()
    if (calloutCloseTimerRef.current !== null) return
    calloutCloseTimerRef.current = window.setTimeout(() => {
      calloutCloseTimerRef.current = null
      setCalloutOpen(false)
      setCalloutPlacement(null)
    }, CALLOUT_CLOSE_DELAY_MS)
  }

  function closeCallout(): void {
    cancelPendingOpen()
    if (calloutCloseTimerRef.current !== null) {
      window.clearTimeout(calloutCloseTimerRef.current)
      calloutCloseTimerRef.current = null
    }
    setCalloutOpen(false)
    setCalloutPlacement(null)
  }

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
    <div
      className="flip-card relative"
      ref={containerRef}
      style={surface}
      onBlur={closeCallout}
      onFocus={openCallout}
      onMouseEnter={scheduleOpenCallout}
      onMouseLeave={scheduleCloseCallout}
    >
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            {faviconUrl ? (
              <img
                alt=""
                className="w-8 h-8 rounded-full shrink-0"
                src={faviconUrl}
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid place-items-center w-8 h-8 rounded-full shrink-0 bg-[var(--card-icon-bg)] text-[var(--card-icon-color)] text-sm font-bold"
              >
                {displayName.trim().charAt(0).toUpperCase() || '?'}
              </span>
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
            </div>
          </div>
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold bg-[var(--card-icon-bg)] text-[var(--card-icon-color)]">
            <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[var(--card-accent)]" />
            {tone}
          </span>
        </div>
        <div className="shrink-0 mt-1">
          <PortfolioCardMenu
            canOpen={canOpen}
            canRefresh={repository.source === 'local'}
            githubUrl={githubUrl(repository)}
            hidden={preference.hidden}
            onOpen={activate}
            onOpenChange={(open) => { if (open) closeCallout() }}
            onRefresh={onRefresh}
            onRename={() => setRenaming(true)}
            refreshing={refreshing}
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
            surface={surface}
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
        {refreshing ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-secondary">Refreshing…</span>
            <RefreshIcon className="w-4 h-4 animate-spin text-text-secondary" />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-secondary">Recommended</span>
            <strong className="text-text-primary text-right">{recommendationTitle(repository)}</strong>
          </div>
        )}
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
      <CardCallout
        onMouseEnter={openCallout}
        onMouseLeave={scheduleCloseCallout}
        placement={calloutPlacement}
        repository={repository}
        surface={surface}
        visible={calloutOpen}
      />
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

function githubUrl(repository: PortfolioRepository): string | null {
  return repository.github.status === 'available'
    ? repository.github.repository.htmlUrl
    : null
}

function upgradeTone(disposition: NonNullable<PortfolioRepository['upgrade']>['disposition']): 'success' | 'warning' | 'info' | 'danger' {
  if (disposition === 'current') return 'success'
  if (disposition === 'bootstrap-required') return 'danger'
  return 'warning'
}
