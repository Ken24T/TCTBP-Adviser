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
  loadAppSettings,
  saveAppSettings,
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
  it('round-trips persisted repository roots', async () => {
    const environment = await settingsEnvironment()
    await saveAppSettings({ repositoryRoots: ['/one', '/two'] }, environment)
    const loaded = await loadAppSettings(environment)
    expect(loaded.repositoryRoots).toEqual(['/one', '/two'])
  })

  it('defaults to an empty root list when no file exists', async () => {
    const environment = await settingsEnvironment()
    const loaded = await loadAppSettings(environment)
    expect(loaded.repositoryRoots).toEqual([])
  })

  it('keeps only string entries from a malformed settings file', async () => {
    const environment = await settingsEnvironment()
    await mkdir(path.dirname(environment.TCTBP_ADVISER_SETTINGS_FILE), {
      recursive: true,
    })
    await writeFile(
      environment.TCTBP_ADVISER_SETTINGS_FILE,
      JSON.stringify({ repositoryRoots: ['/ok', 42, null] }),
    )
    const loaded = await loadAppSettings(environment)
    expect(loaded.repositoryRoots).toEqual(['/ok'])
  })

  it('writes the settings file with restrictive permissions', async () => {
    const environment = await settingsEnvironment()
    await saveAppSettings({ repositoryRoots: ['/one'] }, environment)
    const info = await stat(environment.TCTBP_ADVISER_SETTINGS_FILE)
    expect(info.mode & 0o777).toBe(0o600)
  })

  it('resolves the default settings path under the user config directory', () => {
    expect(appSettingsFilePath({})).toBe(
      path.join(os.homedir(), '.config', 'tctbp-adviser', 'app-settings.json'),
    )
  })
})
