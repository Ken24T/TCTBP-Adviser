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

export function SettingsIcon({ className = '' }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        d="M19.14 12.936a1.5 1.5 0 00.275-1.318 7.95 7.95 0 00-.833-1.884 1.5 1.5 0 00-.95-.644l-1.03-.21a7.95 7.95 0 00-.98-2.325l.36-.99a1.5 1.5 0 00-.44-1.638 7.95 7.95 0 00-1.95-1.345 1.5 1.5 0 00-1.632.174l-.775.72a7.95 7.95 0 00-2.325-.007l-.78-.72a1.5 1.5 0 00-1.638-.44 7.95 7.95 0 00-1.95 1.345 1.5 1.5 0 00-.44 1.638l.36.99a7.95 7.95 0 00-.98 2.325l-1.03.21a1.5 1.5 0 00-.95.644 7.95 7.95 0 00-.833 1.884 1.5 1.5 0 00.275 1.318l.66 1.03a7.95 7.95 0 000 2.325l-.66 1.03a1.5 1.5 0 00-.275 1.318 7.95 7.95 0 00.833 1.884 1.5 1.5 0 00.95.644l1.03.21a7.95 7.95 0 00.98 2.325l-.36.99a1.5 1.5 0 00.44 1.638 7.95 7.95 0 001.95 1.345 1.5 1.5 0 001.632-.174l.775-.72a7.95 7.95 0 002.325.007l.78.72a1.5 1.5 0 001.638.44 7.95 7.95 0 001.95-1.345 1.5 1.5 0 00.44-1.638l-.36-.99a7.95 7.95 0 00.98-2.325l1.03-.21a1.5 1.5 0 00.95-.644 7.95 7.95 0 00.833-1.884 1.5 1.5 0 00-.275-1.318l-.66-1.03a7.95 7.95 0 000-2.325l.66-1.03z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <path
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  )
}
