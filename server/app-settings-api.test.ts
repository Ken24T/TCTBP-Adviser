import { rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppSettingsResponse } from '../shared/app-settings'
import { authorisedFetch, cleanupApis, startApi } from '../test/api-harness'
import { createGitRepository, createTemporaryDirectory } from '../test/helpers'

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

async function saveSettings(
  url: string,
  running: Awaited<ReturnType<typeof startApi>>,
  body: unknown,
): Promise<Response> {
  return authorisedFetch(`${url}/api/settings`, running, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function loadSettings(
  url: string,
  running: Awaited<ReturnType<typeof startApi>>,
): Promise<AppSettingsResponse> {
  const response = await authorisedFetch(`${url}/api/settings`, running)
  expect(response.status).toBe(200)
  return await response.json() as AppSettingsResponse
}

describe('app settings API', () => {
  it('reports environment-locked roots when the environment configures them', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, {
      TCTBP_ADVISER_ALLOWED_ROOT: '/environment-managed',
      TCTBP_ADVISER_SETTINGS_FILE: settingsFile,
    })
    const settings = await loadSettings(running.url, running)
    expect(settings.repositoryRoots.source).toBe('environment')
  })

  it('reports per-field sources', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const settings = await loadSettings(running.url, running)
    expect(settings.repositoryRoots.source).toBe('environment')
    expect(settings.repositoryRoots.effective).toContain(path.dirname(running.repository))
    expect(settings.repositoryRoots.persisted).toEqual([])
    expect(settings.excludeDirectories.source).toBe('default')
  })

  it('persists and applies repository roots', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const secondRoot = await createTemporaryDirectory()
    temporaryDirectories.push(secondRoot)
    await createGitRepository(secondRoot, 'second-repo')

    const put = await saveSettings(running.url, running, {
      repositoryRoots: [secondRoot],
      excludeDirectories: [],
      maximumDepth: null,
      canonicalTctbpWebRoot: null,
      githubEnabled: null,
      githubRepositories: [],
    })
    expect(put.status).toBe(200)

    const settings = await loadSettings(running.url, running)
    expect(settings.repositoryRoots.persisted).toEqual([secondRoot])
    expect(settings.repositoryRoots.effective).toEqual([secondRoot])
    expect(settings.repositoryRoots.source).toBe('settings')

    const portfolio = await authorisedFetch(`${running.url}/api/portfolio`, running)
    const snapshot = await portfolio.json() as { repositories: { name: string }[] }
    const names = snapshot.repositories.map((repository) => repository.name)
    expect(names).toContain('second-repo')
    expect(names).not.toContain('repository')
  })

  it('persists and applies discovery settings', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const put = await saveSettings(running.url, running, {
      repositoryRoots: [path.dirname(running.repository)],
      excludeDirectories: ['build', 'vendor'],
      maximumDepth: 2,
      canonicalTctbpWebRoot: null,
      githubEnabled: null,
      githubRepositories: [],
    })
    expect(put.status).toBe(200)
    const settings = await loadSettings(running.url, running)
    expect(settings.excludeDirectories.effective).toEqual(['.git', 'build', 'vendor'])
    expect(settings.excludeDirectories.source).toBe('settings')
    expect(settings.maximumDepth.effective).toBe(2)
  })

  it('persisted settings override environment defaults', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, {
      TCTBP_ADVISER_EXCLUDE_DIRECTORIES: '["build"]',
      TCTBP_ADVISER_SETTINGS_FILE: settingsFile,
    })
    const put = await saveSettings(running.url, running, {
      excludeDirectories: ['vendor'],
    })
    expect(put.status).toBe(200)
    const settings = await loadSettings(running.url, running)
    expect(settings.excludeDirectories.source).toBe('settings')
    expect(settings.excludeDirectories.effective).toEqual(['.git', 'vendor'])
    expect(settings.excludeDirectories.persisted).toEqual(['vendor'])
  })

  it('rejects invalid directory names', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const put = await saveSettings(running.url, running, {
      excludeDirectories: ['../escape'],
    })
    expect(put.status).toBe(400)
  })

  it('rejects a non-directory repository root', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const put = await saveSettings(running.url, running, {
      repositoryRoots: ['/definitely/not/a/real/directory'],
    })
    expect(put.status).toBe(400)
  })

  it('rejects an empty root list', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const put = await saveSettings(running.url, running, {
      repositoryRoots: [],
    })
    expect(put.status).toBe(400)
  })

  it('rejects an invalid maximum depth', async () => {
    const settingsFile = await settingsFilePath()
    const running = await startApi(false, { TCTBP_ADVISER_SETTINGS_FILE: settingsFile })
    const put = await saveSettings(running.url, running, {
      maximumDepth: 25,
    })
    expect(put.status).toBe(400)
  })
})
