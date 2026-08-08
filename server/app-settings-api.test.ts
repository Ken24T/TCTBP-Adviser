import { rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { authorisedFetch, cleanupApis, startApi } from '../test/api-harness'
import { createGitRepository, createTemporaryDirectory } from '../test/helpers'

interface SettingsBody {
  repositoryRoots: string[]
  persistedRoots: string[]
  source: 'environment' | 'settings'
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  await cleanupApis()
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

async function settingsFilePath(): Promise<string> {
  const directory = await createTemporaryDirectory()
  temporaryDirectories.push(directory)
  return path.join(directory, 'app-settings.json')
}

async function saveRoots(
  url: string,
  running: Awaited<ReturnType<typeof startApi>>,
  repositoryRoots: string[],
): Promise<Response> {
  return authorisedFetch(`${url}/api/settings`, running, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repositoryRoots }),
  })
}

describe('app settings API', () => {
  it('reports the settings source when environment roots are absent', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const response = await authorisedFetch(`${running.url}/api/settings`, running)
    expect(response.status).toBe(200)
    const body = await response.json() as SettingsBody
    expect(body.source).toBe('settings')
    expect(body.repositoryRoots).toContain(path.dirname(running.repository))
    expect(body.persistedRoots).toEqual([])
  })

  it('persists and applies new repository roots', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const secondRoot = await createTemporaryDirectory()
    temporaryDirectories.push(secondRoot)
    await createGitRepository(secondRoot, 'second-repo')

    const put = await saveRoots(running.url, running, [secondRoot])
    expect(put.status).toBe(200)
    const saved = await put.json() as SettingsBody
    expect(saved.source).toBe('settings')
    expect(saved.repositoryRoots).toEqual([secondRoot])

    const portfolio = await authorisedFetch(
      `${running.url}/api/portfolio`,
      running,
    )
    expect(portfolio.status).toBe(200)
    const snapshot = await portfolio.json() as {
      repositories: { name: string }[]
    }
    const names = snapshot.repositories.map((repository) => repository.name)
    expect(names).toContain('second-repo')
    expect(names).not.toContain('repository')
  })

  it('rejects a relative repository root', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const put = await saveRoots(running.url, running, ['relative/path'])
    expect(put.status).toBe(400)
  })

  it('rejects a non-directory repository root', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const put = await saveRoots(running.url, running, [
      '/definitely/not/a/real/directory',
    ])
    expect(put.status).toBe(400)
  })

  it('rejects an empty root list', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const put = await saveRoots(running.url, running, [])
    expect(put.status).toBe(400)
  })

  it('rejects edits when roots are managed by the environment', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, {
      TCTBP_ADVISER_ALLOWED_ROOT: '/environment-managed',
      TCTBP_ADVISER_SETTINGS_FILE: settingsFile,
    })
    const get = await authorisedFetch(`${running.url}/api/settings`, running)
    const body = await get.json() as SettingsBody
    expect(body.source).toBe('environment')

    const put = await saveRoots(running.url, running, [path.dirname(running.repository)])
    expect(put.status).toBe(409)
  })
})
