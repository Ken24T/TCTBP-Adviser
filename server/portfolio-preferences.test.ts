import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadPersistedPortfolioPreferences,
  portfolioPreferencesFilePath,
  savePersistedPortfolioPreferences,
} from './portfolio-preferences'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

async function preferencesFilePath(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tctbp-adviser-prefs-'))
  temporaryDirectories.push(directory)
  return path.join(directory, 'portfolio-preferences.json')
}

describe('persisted portfolio preferences', () => {
  it('returns empty preferences when no file exists', async () => {
    const filePath = await preferencesFilePath()
    const preferences = await loadPersistedPortfolioPreferences({
      TCTBP_ADVISER_PREFERENCES_FILE: filePath,
    })

    expect(preferences).toEqual({})
  })

  it('round-trips preferences through the file', async () => {
    const filePath = await preferencesFilePath()
    const id = 'A'.repeat(24)
    await savePersistedPortfolioPreferences({
      [id]: { pinned: true, hidden: false, name: 'Adviser' },
    }, {
      TCTBP_ADVISER_PREFERENCES_FILE: filePath,
    })

    const loaded = await loadPersistedPortfolioPreferences({
      TCTBP_ADVISER_PREFERENCES_FILE: filePath,
    })
    expect(loaded).toEqual({
      [id]: { pinned: true, hidden: false, name: 'Adviser' },
    })

    const raw = JSON.parse(await readFile(filePath, 'utf8')) as {
      [id: string]: { pinned: boolean; hidden: boolean; name: string }
    }
    expect(raw[id]).toEqual({ pinned: true, hidden: false, name: 'Adviser' })
  })

  it('normalises invalid or unsafe entries on load', async () => {
    const filePath = await preferencesFilePath()
    const valid = 'B'.repeat(24)
    await writeFile(filePath, JSON.stringify({
      '../unsafe': { pinned: true, hidden: true, name: 'Unsafe key' },
      [valid]: { pinned: 'yes', hidden: 1, name: 'x'.repeat(200) },
    }))

    const loaded = await loadPersistedPortfolioPreferences({
      TCTBP_ADVISER_PREFERENCES_FILE: filePath,
    })
    expect(loaded).toEqual({
      [valid]: { pinned: false, hidden: false, name: 'x'.repeat(80) },
    })
  })

  it('honours the environment override for the file path', () => {
    const filePath = '/tmp/custom-portfolio-preferences.json'
    expect(portfolioPreferencesFilePath({
      TCTBP_ADVISER_PREFERENCES_FILE: filePath,
    })).toBe(path.resolve(filePath))
  })
})
