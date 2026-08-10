import { useEffect, useRef, useState } from 'react'
import { Button } from './primitives'

interface RepositoryDetailHeroProps {
  name: string
  description: string
  severity: 'action-recommended' | 'attention' | 'stop' | 'healthy'
  onBack?: () => void
  onRefresh?: () => void
  busy?: boolean
}

/**
 * Tone-themed hero for the repository detail page. Mirrors the portfolio
 * card's surface language: opaque tone-tinted background, 3px accent top
 * border, tone chip, and accent shadow — all driven by the cascading
 * `--card-*` vars set at the detail page root.
 */
export function RepositoryDetailHero({
  name,
  description,
  severity,
  onBack,
  onRefresh,
  busy = false,
}: RepositoryDetailHeroProps) {
  const prevSeverity = useRef(severity)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (prevSeverity.current === severity) return
    prevSeverity.current = severity
    setPulse(true)
    const timer = window.setTimeout(() => setPulse(false), 700)
    return () => window.clearTimeout(timer)
  }, [severity])

  return (
    <section
      className={[
        'bg-[var(--card-surface)] border-t-[3px] border-t-[var(--card-accent)] rounded-2xl p-6 lg:p-8 shadow-[0_2px_12px_rgba(var(--card-accent-rgb),0.15)]',
        pulse ? 'animate-tone-pulse' : '',
      ].join(' ')}
    >
      <div className="flex flex-col lg:flex-row lg:items-start gap-6 justify-between">
        <div className="max-w-3xl">
          {onBack && (
            <button
              className="-ml-2 mb-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-[var(--card-link-text)] hover:text-[var(--card-link-hover-text)] hover:bg-[var(--card-link-hover-bg)] transition-colors"
              type="button"
              onClick={onBack}
            >
              ← Portfolio
            </button>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
              Configured local repository · {severity}
            </p>
          </div>
          <h1 className="mt-2 text-4xl font-semibold text-text-primary tracking-tight">
            {name}
          </h1>
          <p className="mt-3 text-lg text-text-secondary leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={busy}
            size="sm"
            variant="card-tertiary"
            onClick={onRefresh}
          >
            {busy ? 'Inspecting…' : 'Refresh'}
          </Button>
        </div>
      </div>
    </section>
  )
}
