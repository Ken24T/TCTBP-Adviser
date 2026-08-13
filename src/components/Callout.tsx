import { useRef, useState, type ReactNode } from 'react'
import { InfoIcon } from './icons'

interface CalloutProps {
  /**
   * Accessible name for the trigger button, e.g. "Why Checkpoint".
   */
  label: string
  /**
   * Popover content. Rendered only while the callout is open.
   */
  children: ReactNode
  defaultOpen?: boolean
}

/**
 * A small info trigger that reveals an explanation popover on hover, focus,
 * and click, and closes on mouse-leave, blur, or Escape. The trigger is a
 * real button so the callout works for mouse, keyboard, and touch users.
 */
export function Callout({
  label,
  children,
  defaultOpen = false,
}: CalloutProps) {
  const [open, setOpen] = useState(defaultOpen)
  const wrapperRef = useRef<HTMLSpanElement>(null)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      ref={wrapperRef}
    >
      <button
        aria-expanded={open}
        aria-label={label}
        className={[
          'grid w-6 h-6 place-items-center rounded-full transition-colors duration-200',
          'text-text-muted hover:text-teal-600 hover:bg-surface-hover',
          'focus:outline-none focus:ring-2 focus:ring-teal-500',
        ].join(' ')}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
        type="button"
      >
        <InfoIcon className="w-4 h-4" />
      </button>
      {open && (
        <div
          className="absolute z-30 top-full right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] p-4 ad-surface rounded-xl shadow-lg"
          role="tooltip"
        >
          {children}
        </div>
      )}
    </span>
  )
}
