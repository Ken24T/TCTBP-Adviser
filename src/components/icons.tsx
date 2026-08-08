interface IconProps {
  className?: string
}

export function LibraryIcon({ className = '' }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <path
        d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  )
}

export function SearchIcon({ className = '' }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  )
}

export function CloseIcon({ className = '' }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        d="M6 18L18 6M6 6l12 12"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  )
}

export function RefreshIcon({ className = '' }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  )
}
