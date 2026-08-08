export interface AppSettings {
  repositoryRoots: string[]
}

export interface AppSettingsResponse extends AppSettings {
  persistedRoots: string[]
  source: 'environment' | 'settings'
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  repositoryRoots: [],
}
