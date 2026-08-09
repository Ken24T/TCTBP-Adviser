export type AppSettingsSource = 'environment' | 'settings' | 'default'

export interface AppSettingsField<E, P = E> {
  effective: E
  persisted: P
  source: AppSettingsSource
}

export interface AppSettingsResponse {
  repositoryRoots: AppSettingsField<string[]>
  excludeDirectories: AppSettingsField<string[]>
  maximumDepth: AppSettingsField<number, number | null>
  canonicalTctbpWebRoot: AppSettingsField<string | null>
  githubEnabled: AppSettingsField<boolean, boolean | null>
  githubRepositories: AppSettingsField<string[]>
}

export interface PersistedAppSettings {
  repositoryRoots: string[]
  excludeDirectories: string[]
  maximumDepth: number | null
  canonicalTctbpWebRoot: string | null
  githubEnabled: boolean | null
  githubRepositories: string[]
}

export type AppSettingsUpdate = Partial<PersistedAppSettings>

export const DEFAULT_PERSISTED_APP_SETTINGS: PersistedAppSettings = {
  repositoryRoots: [],
  excludeDirectories: [],
  maximumDepth: null,
  canonicalTctbpWebRoot: null,
  githubEnabled: null,
  githubRepositories: [],
}
