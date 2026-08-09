import { useEffect, useRef, useState } from 'react'
import {
  loadServerPortfolioPreferences,
  saveServerPortfolioPreferences,
} from './api-client'
import {
  loadPortfolioPreferences,
  savePortfolioPreferences,
  updatePortfolioPreference,
  type PortfolioPreference,
  type PortfolioPreferences,
} from './portfolio-preferences'

export interface PortfolioPreferencesController {
  preferences: PortfolioPreferences
  changePreference: (
    repositoryId: string,
    patch: Partial<PortfolioPreference>,
  ) => void
}

const SAVE_DEBOUNCE_MS = 250
const RESYNC_INTERVAL_MS = 3_000

function preferencesEqual(
  a: PortfolioPreferences,
  b: PortfolioPreferences,
): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  for (const key of keys) {
    const left = a[key]
    const right = b[key]
    if (
      !right
      || left.pinned !== right.pinned
      || left.hidden !== right.hidden
      || left.name !== right.name
    ) return false
  }
  return true
}

/**
 * Owns the portfolio preferences state (renames, pins, hides). The server
 * file at ~/.config/tctbp-adviser/portfolio-preferences.json is the shared
 * source of truth across browsers and machines; the localStorage copy is only
 * a fast-render cache for the very first paint.
 *
 * Cross-browser sync: the server state is re-adopted on a short poll while
 * the tab is visible. Saves merge only the locally-edited repositories onto
 * the freshest server state, so a change made in another browser for a repo
 * we did not touch is never overwritten. Polls are skipped while local edits
 * are unsaved or a save is in flight.
 */
export function usePortfolioPreferences(
  onSaveError?: (cause: unknown) => void,
): PortfolioPreferencesController {
  const [preferences, setPreferences] = useState<PortfolioPreferences>(
    loadPortfolioPreferences,
  )
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences
  const hydratedRef = useRef(false)
  const dirtyIdsRef = useRef<Set<string>>(new Set())
  const savingRef = useRef(false)
  const onSaveErrorRef = useRef(onSaveError)
  onSaveErrorRef.current = onSaveError

  function adoptServerPreferences(
    serverPreferences: PortfolioPreferences,
  ): void {
    setPreferences((current) => (
      preferencesEqual(current, serverPreferences) ? current : serverPreferences
    ))
    savePortfolioPreferences(serverPreferences)
  }

  // Initial hydration: the server file is the shared source of truth.
  useEffect(() => {
    let cancelled = false
    void loadServerPortfolioPreferences()
      .then((serverPreferences) => {
        if (cancelled) return
        adoptServerPreferences(serverPreferences)
        hydratedRef.current = true
      })
      .catch(() => {
        // Server preferences are best-effort; fall back to local state.
        hydratedRef.current = true
      })
    return () => { cancelled = true }
  }, [])

  // Periodic re-sync so changes made in another browser appear here too.
  // Skipped while local edits are unsaved or a save is in flight — adopting
  // then would overwrite them.
  useEffect(() => {
    const resync = () => {
      if (
        document.hidden
        || savingRef.current
        || dirtyIdsRef.current.size > 0
      ) return
      void loadServerPortfolioPreferences()
        .then((serverPreferences) => adoptServerPreferences(serverPreferences))
        .catch(() => {
          // Best-effort; the next poll will retry.
        })
    }
    const timer = window.setInterval(resync, RESYNC_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  // Debounced save. Only repositories edited locally since the last save are
  // written, merged onto the freshest server state, so foreign changes for
  // other repositories survive.
  useEffect(() => {
    savePortfolioPreferences(preferences)
    if (!hydratedRef.current) return
    const timer = window.setTimeout(() => {
      if (dirtyIdsRef.current.size === 0) return
      const idsToSave = Array.from(dirtyIdsRef.current)
      savingRef.current = true
      void (async () => {
        try {
          const server = await loadServerPortfolioPreferences()
          const merged: PortfolioPreferences = { ...server }
          for (const id of idsToSave) {
            const local = preferencesRef.current[id]
            if (local) merged[id] = local
          }
          await saveServerPortfolioPreferences(merged)
          for (const id of idsToSave) dirtyIdsRef.current.delete(id)
          adoptServerPreferences(merged)
        } catch (cause) {
          onSaveErrorRef.current?.(cause)
        } finally {
          savingRef.current = false
        }
      })()
    }, SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [preferences])

  function changePreference(
    repositoryId: string,
    patch: Partial<PortfolioPreference>,
  ): void {
    dirtyIdsRef.current.add(repositoryId)
    setPreferences((current) => (
      updatePortfolioPreference(current, repositoryId, patch)
    ))
  }

  return { preferences, changePreference }
}
