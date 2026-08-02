import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import {
  loadAiSettings,
  safeAiSettings,
  saveAiSettings,
} from './ai-settings'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('encrypted Adviser AI settings', () => {
  it('round-trips encrypted settings without exposing the API key', async () => {
    const directory = await createTemporaryDirectory()
    temporaryDirectories.push(directory)
    const environment = {
      TCTBP_ADVISER_AI_SETTINGS_FILE: path.join(directory, 'ai-settings.json'),
      TCTBP_ADVISER_AI_KEY_FILE: path.join(directory, 'ai-settings.key'),
    }
    const settings = {
      enabled: true,
      apiKey: 'secret-api-key',
      baseUrl: 'https://example.test/v1',
      model: 'jasper-test',
      timeoutMs: 10_000,
      maximumResponseBytes: 65_536,
    }

    await saveAiSettings(settings, environment)
    const loaded = await loadAiSettings(environment)
    const stored = await readFile(environment.TCTBP_ADVISER_AI_SETTINGS_FILE, 'utf8')

    expect(loaded).toEqual(settings)
    expect(stored).not.toContain('secret-api-key')
    expect(safeAiSettings(loaded)).toEqual({
      enabled: true,
      configured: true,
      baseUrl: 'https://example.test/v1',
      model: 'jasper-test',
      timeoutMs: 10_000,
      maximumResponseBytes: 65_536,
    })
  })

  it('defaults to disabled when no settings file is configured', async () => {
    const directory = await createTemporaryDirectory()
    temporaryDirectories.push(directory)
    const settings = await loadAiSettings({
      TCTBP_ADVISER_AI_SETTINGS_FILE: path.join(directory, 'missing.json'),
      TCTBP_ADVISER_AI_KEY_FILE: path.join(directory, 'missing.key'),
    })

    expect(settings.enabled).toBe(false)
    expect(settings.apiKey).toBeNull()
  })
})
