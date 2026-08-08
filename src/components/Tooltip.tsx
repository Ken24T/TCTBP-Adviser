import type { ReactNode } from 'react'

export function Tooltip({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2.5 py-1.5 text-left shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150"
      >
        <span className="block text-xs font-medium text-white">{label}</span>
        {description && (
          <span className="block text-[10px] text-white/70">{description}</span>
        )}
      </span>
    </span>
  )
}
