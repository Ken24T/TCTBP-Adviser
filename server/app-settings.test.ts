import {
  mkdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appSettingsFilePath,
  loadPersistedAppSettings,
  savePersistedAppSettings,
} from './app-settings'
import { createTemporaryDirectory } from '../test/helpers'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

async function settingsEnvironment(): Promise<{ TCTBP_ADVISER_SETTINGS_FILE: string }> {
  const directory = await createTemporaryDirectory()
  temporaryDirectories.push(directory)
  return {
    TCTBP_ADVISER_SETTINGS_FILE: path.join(directory, 'app-settings.json'),
  }
}

describe('app settings store', () => {
  it('round-trips persisted settings', async () => {
    const environment = await settingsEnvironment()
    await savePersistedAppSettings({
      repositoryRoots: ['/one', '/two'],
      excludeDirectories: ['build', 'vendor'],
      maximumDepth: 4,
      canonicalTctbpWebRoot: '/one/tctbp-web',
      githubEnabled: true,
      githubRepositories: ['owner/repo-a'],
      githubNewRepositoryVisibility: 'private',
    }, environment)
    const loaded = await loadPersistedAppSettings(environment)
    expect(loaded).toEqual({
      repositoryRoots: ['/one', '/two'],
      excludeDirectories: ['build', 'vendor'],
      maximumDepth: 4,
      canonicalTctbpWebRoot: '/one/tctbp-web',
      githubEnabled: true,
      githubRepositories: ['owner/repo-a'],
      githubNewRepositoryVisibility: 'private',
    })
  })

  it('defaults when no file exists', async () => {
    const environment = await settingsEnvironment()
    const loaded = await loadPersistedAppSettings(environment)
    expect(loaded).toEqual({
      repositoryRoots: [],
      excludeDirectories: [],
      maximumDepth: null,
      canonicalTctbpWebRoot: null,
      githubEnabled: null,
      githubRepositories: [],
      githubNewRepositoryVisibility: null,
    })
  })

  it('coerces malformed fields', async () => {
    const environment = await settingsEnvironment()
    await mkdir(path.dirname(environment.TCTBP_ADVISER_SETTINGS_FILE), {
      recursive: true,
    })
    await writeFile(
      environment.TCTBP_ADVISER_SETTINGS_FILE,
      JSON.stringify({
        repositoryRoots: ['/ok', 42, null],
        excludeDirectories: 'not-an-array',
        maximumDepth: 'deep',
        canonicalTctbpWebRoot: 7,
        githubEnabled: 'yes',
        githubRepositories: [1],
      }),
    )
    const loaded = await loadPersistedAppSettings(environment)
    expect(loaded.repositoryRoots).toEqual(['/ok'])
    expect(loaded.excludeDirectories).toEqual([])
    expect(loaded.maximumDepth).toBeNull()
    expect(loaded.canonicalTctbpWebRoot).toBeNull()
    expect(loaded.githubEnabled).toBeNull()
    expect(loaded.githubRepositories).toEqual([])
  })

  it('writes the settings file with restrictive permissions', async () => {
    const environment = await settingsEnvironment()
    await savePersistedAppSettings({
      repositoryRoots: ['/one'],
      excludeDirectories: [],
      maximumDepth: null,
      canonicalTctbpWebRoot: null,
      githubEnabled: null,
      githubRepositories: [],
      githubNewRepositoryVisibility: null,
    }, environment)
    const info = await stat(environment.TCTBP_ADVISER_SETTINGS_FILE)
    expect(info.mode & 0o777).toBe(0o600)
  })

  it('resolves the default settings path under the user config directory', () => {
    expect(appSettingsFilePath({})).toBe(
      path.join(os.homedir(), '.config', 'tctbp-adviser', 'app-settings.json'),
    )
  })
})
