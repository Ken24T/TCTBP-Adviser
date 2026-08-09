import { useEffect, useRef, useState } from 'react'
import { KebabIcon } from './icons'

interface PortfolioCardMenuProps {
  pinned: boolean
  hidden: boolean
  canOpen: boolean
  canRefresh: boolean
  githubUrl: string | null
  repositoryName: string
  tctbpStatus: string
  sourceStatus: string
  sourceTone: 'success' | 'warning' | 'info'
  upgradeStatus: string | null
  upgradeTone: 'success' | 'warning' | 'danger' | 'info' | null
  upgradeReasons: string[]
  onTogglePin: () => void
  onToggleHide: () => void
  onOpen: () => void
  onRefresh: () => void
  onRename: () => void
  onOpenChange?: (open: boolean) => void
}

const TONE_DOTS: Record<string, string> = {
  success: 'bg-teal-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
}

/**
 * Kebab ('...') menu for a portfolio card, mirroring the Intranet
 * FunctionCard's more-button. Carries the card's actions (pin, hide, open,
 * rename) and its informational pills (TCTBP, source, upgrade status). The
 * dropdown stays in the DOM when closed (display: none) so the information is
 * still present for assistive tech and static markup.
 */
export function PortfolioCardMenu({
  pinned,
  hidden,
  canOpen,
  canRefresh,
  githubUrl,
  repositoryName,
  tctbpStatus,
  sourceStatus,
  sourceTone,
  upgradeStatus,
  upgradeTone,
  upgradeReasons,
  onTogglePin,
  onToggleHide,
  onOpen,
  onRefresh,
  onRename,
  onOpenChange,
}: PortfolioCardMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    onOpenChange?.(open)
  }, [onOpenChange, open])

  // Actions close the dropdown before running, so the menu never lingers
  // after a selection.
  const runAndClose = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: MouseEvent) => {
      if (
        containerRef.current
        && !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions for ${repositoryName}`}
        className="grid place-items-center w-7 h-7 rounded-md bg-[var(--card-icon-bg)] text-[var(--card-icon-color)] hover:bg-[var(--card-btn-hover-bg)] transition-colors"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <KebabIcon className="w-4 h-4" />
      </button>
      <div
        className={[
          'absolute right-0 top-full mt-1 z-30 min-w-56 py-1.5 rounded-xl border border-border bg-[var(--ad-surface-elevated)] shadow-[0_8px_24px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.12)]',
          open ? '' : 'hidden',
        ].join(' ')}
        onClick={(event) => event.stopPropagation()}
        role="menu"
      >
        <MenuItem label={pinned ? 'Unpin from top' : 'Pin to top'} onClick={runAndClose(onTogglePin)} />
        <MenuItem label={hidden ? 'Show repository' : 'Hide repository'} onClick={runAndClose(onToggleHide)} />
        <MenuItem disabled={!canOpen} label="View repository" onClick={runAndClose(onOpen)} />
        {githubUrl && <MenuItem href={githubUrl} label="View on GitHub" />}
        <MenuItem disabled={!canRefresh} label="Refresh" onClick={runAndClose(onRefresh)} />
        <MenuItem label="Rename…" onClick={runAndClose(onRename)} />
        <div className="my-1.5 h-px bg-[var(--ad-border)]" role="separator" />
        <InfoRow label="TCTBP" tone={null} value={tctbpStatus} />
        <InfoRow label="Source" tone={sourceTone} value={sourceStatus} />
        {upgradeStatus && (
          <InfoRow label="Upgrade" tone={upgradeTone} value={upgradeStatus} />
        )}
        {upgradeReasons.length > 0 && (
          <div className="px-3 pt-1 pb-1.5 space-y-0.5">
            {upgradeReasons.map((reason) => (
              <p className="text-xs text-text-muted" key={reason}>{reason}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  href,
  disabled = false,
}: {
  label: string
  onClick?: () => void
  href?: string
  disabled?: boolean
}) {
  const classes = 'block w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
  if (href) {
    return (
      <a className={classes} href={href} rel="noreferrer" role="menuitem" target="_blank">
        {label}
      </a>
    )
  }
  return (
    <button
      className={classes}
      disabled={disabled}
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function InfoRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: string | null
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-text-primary">
        {tone && (
          <span aria-hidden="true" className={`w-2 h-2 rounded-full ${TONE_DOTS[tone]}`} />
        )}
        {value}
      </span>
    </div>
  )
}
