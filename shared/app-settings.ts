export type AppSettingsSource = 'environment' | 'settings' | 'default'

export interface AppSettingsField<E, P = E> {
  effective: E
  persisted: P
  source: AppSettingsSource
}

export type GithubRepositoryVisibility = 'private' | 'public'

/**
 * Read-only status of the configured GitHub access. The token itself is never
 * exposed — only whether it exists, authenticates, and can create repositories.
 */
export interface GithubAccessStatus {
  configured: boolean
  authenticated: boolean
  account: { login: string; name: string | null } | null
  /** Classic PAT scopes; empty for fine-grained tokens or when unauthenticated. */
  scopes: string[]
  /** True with the repo scope; null when the token type makes it unknown. */
  canCreateRepositories: boolean | null
  message: string | null
}

export interface AppSettingsResponse {
  repositoryRoots: AppSettingsField<string[]>
  excludeDirectories: AppSettingsField<string[]>
  maximumDepth: AppSettingsField<number, number | null>
  canonicalTctbpWebRoot: AppSettingsField<string | null>
  githubEnabled: AppSettingsField<boolean, boolean | null>
  githubRepositories: AppSettingsField<string[]>
  githubNewRepositoryVisibility: AppSettingsField<GithubRepositoryVisibility | null>
  githubAccess: GithubAccessStatus
}

export interface PersistedAppSettings {
  repositoryRoots: string[]
  excludeDirectories: string[]
  maximumDepth: number | null
  canonicalTctbpWebRoot: string | null
  githubEnabled: boolean | null
  githubRepositories: string[]
  githubNewRepositoryVisibility: GithubRepositoryVisibility | null
}

export type AppSettingsUpdate = Partial<PersistedAppSettings>

export const DEFAULT_PERSISTED_APP_SETTINGS: PersistedAppSettings = {
  repositoryRoots: [],
  excludeDirectories: [],
  maximumDepth: null,
  canonicalTctbpWebRoot: null,
  githubEnabled: null,
  githubRepositories: [],
  githubNewRepositoryVisibility: null,
}
