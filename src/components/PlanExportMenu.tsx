import { useEffect, useRef, useState } from 'react'
import { KebabIcon } from './icons'

/**
 * Kebab menu in the panel header bundling the plan export actions. The
 * dropdown stays in the DOM when closed (hidden) so the actions remain in
 * static markup for assistive tech and tests.
 */
export function PlanExportMenu({
  onMarkdown,
  onJson,
  onCopy,
}: {
  onMarkdown: () => void
  onJson: () => void
  onCopy: () => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

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

  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Export TCTBP upgrade plan"
        className="grid place-items-center w-8 h-8 rounded-md bg-surface-soft border border-border text-text-secondary hover:bg-surface-hover transition-colors"
        type="button"
        onClick={() => setOpen(!open)}
      >
        <KebabIcon className="w-4 h-4" />
      </button>
      <div
        className={[
          'absolute right-0 top-full mt-1 z-30 min-w-48 py-1.5 rounded-xl border border-border bg-[var(--ad-surface-elevated)] shadow-[0_8px_24px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.12)]',
          open ? '' : 'hidden',
        ].join(' ')}
        onClick={(event) => event.stopPropagation()}
        role="menu"
      >
        <ExportItem label="Download Markdown" onClick={run(onMarkdown)} />
        <ExportItem label="Download JSON" onClick={run(onJson)} />
        <ExportItem label="Copy Markdown" onClick={run(onCopy)} />
      </div>
    </div>
  )
}

function ExportItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="block w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover transition-colors"
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}
