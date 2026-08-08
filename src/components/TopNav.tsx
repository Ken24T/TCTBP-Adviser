import { useRef, useState } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { CloseIcon, LibraryIcon, RefreshIcon, SearchIcon } from './icons'

interface TopNavProps {
  busy: boolean
  query: string
  onQueryChange: (query: string) => void
  onRefresh: () => void
  onShowPortfolio: () => void
  onShowReference: () => void
}

export function TopNav({
  busy,
  query,
  onQueryChange,
  onRefresh,
  onShowPortfolio,
  onShowReference,
}: TopNavProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const searchButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeSearch = () => {
    onQueryChange('')
    setSearchOpen(false)
    searchButtonRef.current?.focus()
  }

  return (
    <nav
      aria-label="Application"
      className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b border-teal-700 bg-gradient-to-r from-teal-900 to-teal-700 text-white shadow-md"
    >
      <button
        aria-label="Show repository portfolio"
        className="flex items-center gap-3 text-left"
        type="button"
        onClick={onShowPortfolio}
      >
        <span
          aria-hidden="true"
          className="grid w-10 h-10 text-lg font-black leading-none place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 text-cream-50"
        >
          T
        </span>
        <span className="leading-tight">
          <strong className="block text-lg tracking-tight">TCTBP</strong>
          <small className="block text-xs text-white/60 uppercase tracking-widest">Adviser</small>
        </span>
      </button>
      <div className="flex items-center gap-4">
        <span className="hidden md:inline text-xs text-white/60 uppercase tracking-widest">
          Local-first repository portfolio
        </span>
        <button
          aria-label="TCTBP reference"
          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          type="button"
          onClick={onShowReference}
        >
          <LibraryIcon className="w-5 h-5" />
        </button>
        <button
          aria-expanded={searchOpen}
          aria-label={searchOpen ? 'Close search' : 'Search repositories'}
          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          ref={searchButtonRef}
          type="button"
          onClick={() => setSearchOpen(!searchOpen)}
        >
          <SearchIcon className="w-5 h-5" />
        </button>
        {searchOpen && (
          <div className="relative">
            <input
              aria-label="Search repositories"
              autoFocus
              className="w-44 pr-8 bg-white/10 border border-white/25 text-white placeholder-white/60 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent transition-colors"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeSearch()
              }}
              placeholder="Search repositories"
              type="text"
              value={query}
            />
            {query.length > 0 && (
              <button
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                type="button"
                onClick={closeSearch}
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        <button
          aria-label={busy ? 'Refreshing portfolio' : 'Refresh portfolio'}
          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={busy}
          type="button"
          onClick={onRefresh}
        >
          <RefreshIcon className={`w-5 h-5 ${busy ? 'animate-spin' : ''}`} />
        </button>
        <ThemeToggle />
      </div>
    </nav>
  )
}
