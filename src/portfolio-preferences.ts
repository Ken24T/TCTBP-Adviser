export interface PortfolioPreference {
  pinned: boolean
  hidden: boolean
  name: string
}

export type PortfolioPreferences = Record<string, PortfolioPreference>

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

export function normalisePreferences(value: unknown): PortfolioPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  const result: PortfolioPreferences = {}
  for (const [id, candidate] of Object.entries(value)) {
    if (
      !/^[A-Za-z0-9_-]{24}$/.test(id)
      || typeof candidate !== 'object'
      || candidate === null
      || Array.isArray(candidate)
    ) continue
    const preference = candidate as Record<string, unknown>
    result[id] = {
      pinned: preference.pinned === true,
      hidden: preference.hidden === true,
      name: typeof preference.name === 'string'
        ? preference.name.slice(0, 80)
        : '',
    }
  }
  return result
}
