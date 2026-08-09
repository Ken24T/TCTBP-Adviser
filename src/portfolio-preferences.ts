export type {
  PortfolioPreference,
  PortfolioPreferences,
} from '../shared/portfolio-preferences'
import {
  normalisePreferences,
  type PortfolioPreference,
  type PortfolioPreferences,
} from '../shared/portfolio-preferences'
export { normalisePreferences } from '../shared/portfolio-preferences'

const STORAGE_KEY = 'tctbp-adviser.portfolio-preferences.v1'

export function loadPortfolioPreferences(): PortfolioPreferences {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    return normalisePreferences(parsed)
  } catch {
    return {}
  }
}

export function savePortfolioPreferences(
  preferences: PortfolioPreferences,
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Browser preferences are optional and never affect repository advice.
  }
}

export function updatePortfolioPreference(
  preferences: PortfolioPreferences,
  repositoryId: string,
  patch: Partial<PortfolioPreference>,
): PortfolioPreferences {
  const current = preferences[repositoryId] ?? {
    pinned: false,
    hidden: false,
    name: '',
  }
  return {
    ...preferences,
    [repositoryId]: {
      ...current,
      ...patch,
      name: (patch.name ?? current.name).slice(0, 80),
    },
  }
}
