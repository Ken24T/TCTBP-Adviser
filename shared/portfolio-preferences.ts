export interface PortfolioPreference {
  pinned: boolean
  hidden: boolean
  name: string
}

export type PortfolioPreferences = Record<string, PortfolioPreference>

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
