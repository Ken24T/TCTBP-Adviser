import type {
  AppSettingsResponse,
  AppSettingsSource,
  PersistedAppSettings,
} from '../shared/app-settings'
import type { ApiRuntime } from './api-runtime'
import { loadPersistedAppSettings, savePersistedAppSettings } from './app-settings'
import { loadServiceConfig } from './config'
import { AdviserError } from './errors'
import {
  settingsObject,
  validateBooleanSetting,
  validateCanonicalRoot,
  validateDirectoryNames,
  validateGithubRepositories,
  validateMaximumDepth,
  validateRepositoryRoots,
} from './settings-validation'

function environmentHasValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): boolean {
  const value = environment[name]
  return value !== undefined && value !== ''
}

function settingsFieldSource(
  environment: NodeJS.ProcessEnv,
  name: string,
  persistedPresent: boolean,
): AppSettingsSource {
  if (persistedPresent) return 'settings'
  if (environmentHasValue(environment, name)) return 'environment'
  return 'default'
}

function rootsFieldSource(
  environment: NodeJS.ProcessEnv,
  persisted: PersistedAppSettings,
): AppSettingsSource {
  if (persisted.repositoryRoots.length > 0) return 'settings'
  if (
    environmentHasValue(environment, 'TCTBP_ADVISER_REPOSITORY_ROOTS')
    || environmentHasValue(environment, 'TCTBP_ADVISER_ALLOWED_ROOT')
  ) return 'environment'
  return 'default'
}

async function readSettingsResponse(
  runtime: ApiRuntime,
): Promise<AppSettingsResponse> {
  const persisted = await loadPersistedAppSettings(runtime.environment)
  const environment = runtime.environment
  return {
    repositoryRoots: {
      effective: runtime.registry.discovery.repositoryRoots,
      persisted: persisted.repositoryRoots,
      source: rootsFieldSource(environment, persisted),
    },
    excludeDirectories: {
      effective: runtime.registry.discovery.excludeDirectories,
      persisted: persisted.excludeDirectories,
      source: settingsFieldSource(
        environment,
        'TCTBP_ADVISER_EXCLUDE_DIRECTORIES',
        persisted.excludeDirectories.length > 0,
      ),
    },
    maximumDepth: {
      effective: runtime.registry.discovery.maximumDepth,
      persisted: persisted.maximumDepth,
      source: settingsFieldSource(
        environment,
        'TCTBP_ADVISER_MAXIMUM_DEPTH',
        persisted.maximumDepth !== null,
      ),
    },
    canonicalTctbpWebRoot: {
      effective: runtime.tctbpSource.sourceRoot,
      persisted: persisted.canonicalTctbpWebRoot,
      source: settingsFieldSource(
        environment,
        'TCTBP_ADVISER_TCTBP_WEB_ROOT',
        persisted.canonicalTctbpWebRoot !== null,
      ),
    },
    githubEnabled: {
      effective: runtime.github.config.enabled,
      persisted: persisted.githubEnabled,
      source: settingsFieldSource(
        environment,
        'TCTBP_ADVISER_GITHUB_ENABLED',
        persisted.githubEnabled !== null,
      ),
    },
    githubRepositories: {
      effective: runtime.github.config.repositories,
      persisted: persisted.githubRepositories,
      source: settingsFieldSource(
        environment,
        'TCTBP_ADVISER_GITHUB_REPOSITORIES',
        persisted.githubRepositories.length > 0,
      ),
    },
  }
}

async function applyPersistedSettings(
  persisted: PersistedAppSettings,
  body: unknown,
): Promise<PersistedAppSettings> {
  const update = settingsObject(body)
  const next: PersistedAppSettings = { ...persisted }

  if ('repositoryRoots' in update) {
    next.repositoryRoots = await validateRepositoryRoots(update.repositoryRoots)
  }
  if ('excludeDirectories' in update) {
    next.excludeDirectories = validateDirectoryNames(update.excludeDirectories)
  }
  if ('maximumDepth' in update) {
    next.maximumDepth = validateMaximumDepth(update.maximumDepth)
  }
  if ('canonicalTctbpWebRoot' in update) {
    next.canonicalTctbpWebRoot = await validateCanonicalRoot(
      update.canonicalTctbpWebRoot,
      next.repositoryRoots,
    )
  }
  if ('githubEnabled' in update) {
    next.githubEnabled = validateBooleanSetting(update.githubEnabled)
  }
  if ('githubRepositories' in update) {
    next.githubRepositories = validateGithubRepositories(update.githubRepositories)
  }

  return next
}

async function applyEffectiveSettingsToRuntime(runtime: ApiRuntime): Promise<void> {
  const config = await loadServiceConfig(runtime.environment)
  runtime.registry.updateRepositoryRoots(config.repositoryRoots)
  runtime.registry.discovery.setExcludeDirectories(config.excludeDirectories)
  runtime.registry.discovery.setMaximumDepth(config.maximumDepth)
  runtime.tctbpSource.setSourceRoot(config.canonicalTctbpWebRoot ?? null)
  runtime.github.setConfig({
    ...runtime.github.config,
    enabled: config.github.enabled,
    repositories: config.github.repositories,
  })
}

export {
  applyEffectiveSettingsToRuntime,
  applyPersistedSettings,
  readSettingsResponse,
}
