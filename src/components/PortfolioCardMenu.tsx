import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { KebabIcon } from './icons'

interface PortfolioCardMenuProps {
  pinned: boolean
  hidden: boolean
  canOpen: boolean
  canRefresh: boolean
  refreshing?: boolean
  githubUrl: string | null
  repositoryName: string
  /** Card surface CSS variables, re-applied when the menu is portaled. */
  surface?: CSSProperties
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
  refreshing = false,
  githubUrl,
  repositoryName,
  surface,
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
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

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
      const target = event.target as Node
      if (
        containerRef.current?.contains(target)
        || menuRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
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

  // Position the portaled menu beside the button, flipping upward when it
  // would run past the bottom of the viewport (avoids clipping for cards
  // near the bottom of the page) and clamping it inside the viewport.
  useLayoutEffect(() => {
    if (!open) return
    const button = buttonRef.current
    const menu = menuRef.current
    if (!button || !menu) return
    const buttonRect = button.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const GAP = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const opensDown = buttonRect.bottom + menuRect.height + GAP <= viewportHeight
    const top = opensDown
      ? buttonRect.bottom + GAP
      : Math.max(GAP, buttonRect.top - menuRect.height - GAP)
    const right = Math.max(
      GAP,
      Math.min(
        viewportWidth - menuRect.width - GAP,
        viewportWidth - buttonRect.right,
      ),
    )
    setPosition({ top, right })
  }, [open])

  const menuContent = (
    <>
      <MenuItem label={pinned ? 'Unpin from top' : 'Pin to top'} onClick={runAndClose(onTogglePin)} />
      <MenuItem label={hidden ? 'Show repository' : 'Hide repository'} onClick={runAndClose(onToggleHide)} />
      <MenuItem disabled={!canOpen} label="View repository" onClick={runAndClose(onOpen)} />
      {githubUrl && <MenuItem href={githubUrl} label="View on GitHub" />}
      <MenuItem
        disabled={!canRefresh || refreshing}
        label={refreshing ? 'Refreshing…' : 'Refresh'}
        onClick={runAndClose(onRefresh)}
      />
      <MenuItem label="Rename…" onClick={runAndClose(onRename)} />
      <div className="my-1.5 h-px bg-[var(--card-btn-border)]" role="separator" />
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
    </>
  )

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions for ${repositoryName}`}
        className="grid place-items-center w-7 h-7 rounded-md bg-[var(--card-icon-bg)] text-[var(--card-icon-color)] hover:bg-[var(--card-btn-hover-bg)] transition-colors"
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <KebabIcon className="w-4 h-4" />
      </button>
      {open ? createPortal(
        <div
          className="fixed z-50 min-w-56 py-1.5 rounded-xl border border-[var(--card-btn-border)] border-t-[3px] border-t-[var(--card-accent)] bg-[var(--card-text-block-bg)] shadow-[0_8px_24px_rgba(var(--card-accent-rgb),0.30),0_2px_8px_rgba(var(--card-accent-rgb),0.18)]"
          onClick={(event) => event.stopPropagation()}
          ref={menuRef}
          role="menu"
          style={position ? { ...surface, top: position.top, right: position.right } : undefined}
        >
          {menuContent}
        </div>,
        document.body,
      ) : (
        // Closed-state copy stays in the DOM (display: none) so the
        // information is still present for assistive tech and static markup.
        <div className="hidden" role="menu">
          {menuContent}
        </div>
      )}
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
  const classes = 'block w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-[var(--card-btn-hover-bg)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
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
