import { rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PortfolioPreferences } from '../shared/portfolio-preferences'
import { authorisedFetch, cleanupApis, startApi } from '../test/api-harness'
import { createTemporaryDirectory } from '../test/helpers'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await cleanupApis()
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

async function preferencesFilePath(): Promise<string> {
  const directory = await createTemporaryDirectory()
  temporaryDirectories.push(directory)
  return path.join(directory, 'portfolio-preferences.json')
}

async function loadPreferences(
  url: string,
  running: Awaited<ReturnType<typeof startApi>>,
): Promise<PortfolioPreferences> {
  const response = await authorisedFetch(`${url}/api/preferences`, running)
  expect(response.status).toBe(200)
  return await response.json() as PortfolioPreferences
}

describe('portfolio preferences API', () => {
  it('returns empty preferences before any save', async () => {
    const filePath = await preferencesFilePath()
    const running = await startApi(false, {
      TCTBP_ADVISER_PREFERENCES_FILE: filePath,
    })

    expect(await loadPreferences(running.url, running)).toEqual({})
  })

  it('persists preferences and returns them on later reads', async () => {
    const filePath = await preferencesFilePath()
    const running = await startApi(false, {
      TCTBP_ADVISER_PREFERENCES_FILE: filePath,
    })
    const id = 'A'.repeat(24)
    const saved: PortfolioPreferences = {
      [id]: { pinned: true, hidden: false, name: 'Adviser' },
    }

    const saveResponse = await authorisedFetch(
      `${running.url}/api/preferences`,
      running,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saved),
      },
    )
    expect(saveResponse.status).toBe(200)
    expect(await loadPreferences(running.url, running)).toEqual(saved)

    await cleanupApis()
    const second = await startApi(false, {
      TCTBP_ADVISER_PREFERENCES_FILE: filePath,
    })
    expect(await loadPreferences(second.url, second)).toEqual(saved)
  })

  it('normalises unsafe entries on save', async () => {
    const filePath = await preferencesFilePath()
    const running = await startApi(false, {
      TCTBP_ADVISER_PREFERENCES_FILE: filePath,
    })
    const id = 'B'.repeat(24)

    const saveResponse = await authorisedFetch(
      `${running.url}/api/preferences`,
      running,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          '../unsafe': { pinned: true, hidden: true, name: 'Unsafe key' },
          [id]: { pinned: true, hidden: false, name: 'Adviser' },
        }),
      },
    )
    expect(saveResponse.status).toBe(200)

    const loaded = await loadPreferences(running.url, running)
    expect(loaded).toEqual({
      [id]: { pinned: true, hidden: false, name: 'Adviser' },
    })
  })
})
