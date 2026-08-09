import type {
  PortfolioPreference,
  PortfolioPreferences,
} from '../portfolio-preferences'
import { Button } from './primitives'

export interface RepositoryIdentity {
  id: string
  name: string
  directoryName?: string | null
}

interface CardVisibilitySettingsProps {
  repositories: RepositoryIdentity[]
  preferences: PortfolioPreferences
  onPreferenceChange: (
    repositoryId: string,
    patch: Partial<PortfolioPreference>,
  ) => void
}

/**
 * Settings list of every portfolio repository with a Show/Hide control.
 * Applies immediately to the portfolio preferences (same store as the card
 * kebab menu's Hide/Show items).
 */
export function CardVisibilitySettings({
  repositories,
  preferences,
  onPreferenceChange,
}: CardVisibilitySettingsProps) {
  const sorted = [...repositories].sort((left, right) => (
    displayName(left, preferences).toLocaleLowerCase()
      .localeCompare(displayName(right, preferences).toLocaleLowerCase())
  ))

  return (
    <ul className="divide-y divide-border">
      {sorted.map((repository) => {
        const hidden = preferences[repository.id]?.hidden ?? false
        const name = displayName(repository, preferences)
        return (
          <li
            className="flex items-center justify-between gap-4 py-2"
            key={repository.id}
          >
            <span className="min-w-0">
              <strong className="block text-sm font-medium text-text-primary truncate">
                {name}
              </strong>
              {repository.directoryName && repository.directoryName !== name && (
                <small className="block text-xs text-text-faint truncate">
                  {repository.directoryName}
                </small>
              )}
            </span>
            <Button
              size="sm"
              variant={hidden ? 'primary' : 'tertiary'}
              onClick={() => onPreferenceChange(repository.id, { hidden: !hidden })}
            >
              {hidden ? 'Show' : 'Hide'}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

function displayName(
  repository: RepositoryIdentity,
  preferences: PortfolioPreferences,
): string {
  return preferences[repository.id]?.name.trim() || repository.name
}
