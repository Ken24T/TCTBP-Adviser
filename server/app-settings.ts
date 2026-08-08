import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
} from '../shared/app-settings'

export async function loadAppSettings(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<AppSettings> {
  const filePath = appSettingsFilePath(environment)
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<AppSettings>
    return {
      repositoryRoots: Array.isArray(parsed.repositoryRoots)
        ? parsed.repositoryRoots.filter(
          (root): root is string => typeof root === 'string',
        )
        : DEFAULT_APP_SETTINGS.repositoryRoots,
    }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

export async function saveAppSettings(
  settings: AppSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const filePath = appSettingsFilePath(environment)
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  await writeFile(
    filePath,
    `${JSON.stringify({ repositoryRoots: settings.repositoryRoots }, null, 2)}\n`,
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
