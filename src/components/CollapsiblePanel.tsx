import { useState, type ReactNode } from 'react'
import { ChevronDownIcon } from './icons'

/**
 * A panel whose body is collapsed by default: the header stays visible and
 * acts as a toggle, so supporting detail is always one click away without
 * cluttering the page. Mirrors the collapsible settings sections.
 */
export function CollapsiblePanel({
  eyebrow,
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  eyebrow?: string
  title: string
  badge?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="ad-surface p-6">
      <button
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 text-left"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="space-y-1">
          {eyebrow && (
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600">{eyebrow}</p>
          )}
          <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
          {badge}
        </div>
        <ChevronDownIcon
          className={[
            'w-5 h-5 text-text-muted transition-transform duration-200 shrink-0 mt-1',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  )
}
