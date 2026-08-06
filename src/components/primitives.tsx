import { type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}) {
  const base = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  }
  const variantClasses = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-500 shadow-soft',
    secondary: 'bg-butter-100 text-text-primary hover:bg-butter-200 focus:ring-butter-400 border border-butter-300',
    tertiary: 'bg-surface-soft text-text-primary hover:bg-surface-hover focus:ring-ink-400 border border-border',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  }

  return (
    <button
      className={`${base} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

export function Card({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
}) {
  return (
    <div
      className={[
        'ad-surface p-6 transition-all duration-200',
        hover ? 'hover:shadow-lg hover:border-teal-300 cursor-pointer' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'
}) {
  const toneClasses = {
    neutral: 'bg-surface-soft text-text-secondary border border-border',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
    accent: 'bg-teal-100 text-teal-800',
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  )
}

export function StatusPill({
  status,
}: {
  status: 'healthy' | 'attention' | 'stop' | 'unknown' | string
}) {
  const tone = status === 'healthy' ? 'success'
    : status === 'attention' ? 'warning'
    : status === 'stop' ? 'danger'
    : 'neutral'
  return <Badge tone={tone}>{status}</Badge>
}

export function Section({
  children,
  title,
  eyebrow,
  className = '',
}: {
  children: ReactNode
  title?: string
  eyebrow?: string
  className?: string
}) {
  return (
    <section className={`space-y-4 ${className}`}>
      {(eyebrow || title) && (
        <div className="space-y-1">
          {eyebrow && (
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600">
              {eyebrow}
            </p>
          )}
          {title && <h2 className="text-2xl font-semibold text-text-primary">{title}</h2>}
        </div>
      )}
      {children}
    </section>
  )
}

export function EmptyState({
  title,
  description,
  eyebrow = 'Nothing to show',
}: {
  title: string
  description: string
  eyebrow?: string
}) {
  return (
    <Card className="text-center py-16">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-600">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-text-muted">{description}</p>
    </Card>
  )
}

export function PanelHeading({
  eyebrow,
  title,
  id,
}: {
  eyebrow: string
  title: string
  id: string
}) {
  return (
    <div className="mb-4 space-y-1">
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-widest text-teal-600">{eyebrow}</p>
      )}
      <h2 id={id} className="text-xl font-semibold text-text-primary">{title}</h2>
    </div>
  )
}

export function Panel({
  children,
  title,
  eyebrow,
  id,
  className = '',
}: {
  children: ReactNode
  title?: string
  eyebrow?: string
  id?: string
  className?: string
}) {
  return (
    <section className={`ad-surface p-6 ${className}`}>
      {(eyebrow || title) && (
        <div className="mb-4 space-y-1">
          {eyebrow && (
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600">{eyebrow}</p>
          )}
          {title && <h2 id={id} className="text-xl font-semibold text-text-primary">{title}</h2>}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageHeader({
  title,
  eyebrow,
  description,
  onBack,
  actions,
}: {
  title: string
  eyebrow?: string
  description?: string
  onBack?: () => void
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-end gap-6 justify-between">
      <div className="max-w-3xl">
        {onBack && (
          <button
            className="mb-2 text-sm font-medium text-teal-700 hover:text-teal-800 transition-colors"
            type="button"
            onClick={onBack}
          >
            ← Portfolio
          </button>
        )}
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-widest text-teal-600">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-4xl font-semibold text-text-primary tracking-tight">{title}</h1>
        {description && (
          <p className="mt-3 text-lg text-text-secondary leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  )
}

export function Select({
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`px-4 py-2.5 pr-8 text-sm text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${className}`}
      {...props}
    />
  )
}

export function KeyValue({
  items,
  className = '',
}: {
  items: { key: string; value: ReactNode }[]
  className?: string
}) {
  return (
    <dl className={`space-y-2 ${className}`}>
      {items.map(({ key, value }) => (
        <div key={key} className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
          <dt className="text-sm text-text-muted">{key}</dt>
          <dd className="text-sm font-medium text-text-primary text-right break-all">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
