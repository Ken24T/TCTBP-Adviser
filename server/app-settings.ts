import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_PERSISTED_APP_SETTINGS,
  type PersistedAppSettings,
} from '../shared/app-settings'

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

export async function loadPersistedAppSettings(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PersistedAppSettings> {
  const filePath = appSettingsFilePath(environment)
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>
    return {
      repositoryRoots: stringList(parsed.repositoryRoots),
      excludeDirectories: stringList(parsed.excludeDirectories),
      maximumDepth: typeof parsed.maximumDepth === 'number'
        && Number.isInteger(parsed.maximumDepth)
        ? parsed.maximumDepth
        : null,
      canonicalTctbpWebRoot: typeof parsed.canonicalTctbpWebRoot === 'string'
        ? parsed.canonicalTctbpWebRoot
        : null,
      githubEnabled: typeof parsed.githubEnabled === 'boolean'
        ? parsed.githubEnabled
        : null,
      githubRepositories: stringList(parsed.githubRepositories),
      githubNewRepositoryVisibility: (
        parsed.githubNewRepositoryVisibility === 'private'
        || parsed.githubNewRepositoryVisibility === 'public'
      ) ? parsed.githubNewRepositoryVisibility : null,
    }
  } catch {
    return { ...DEFAULT_PERSISTED_APP_SETTINGS }
  }
}

export async function savePersistedAppSettings(
  settings: PersistedAppSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const filePath = appSettingsFilePath(environment)
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  await writeFile(
    filePath,
    `${JSON.stringify(settings, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
  await chmod(filePath, 0o600)
}

export function appSettingsFilePath(environment: NodeJS.ProcessEnv): string {
  return path.resolve(
    environment.TCTBP_ADVISER_SETTINGS_FILE
      ?? path.join(os.homedir(), '.config', 'tctbp-adviser', 'app-settings.json'),
  )
}
