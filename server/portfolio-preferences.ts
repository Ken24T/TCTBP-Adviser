import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  normalisePreferences,
  type PortfolioPreferences,
} from '../shared/portfolio-preferences'

export async function loadPersistedPortfolioPreferences(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<PortfolioPreferences> {
  const filePath = portfolioPreferencesFilePath(environment)
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown
    return normalisePreferences(parsed)
  } catch {
    return {}
  }
}

export async function savePersistedPortfolioPreferences(
  preferences: PortfolioPreferences,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const filePath = portfolioPreferencesFilePath(environment)
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  await writeFile(
    filePath,
    `${JSON.stringify(preferences, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
  await chmod(filePath, 0o600)
}

export function portfolioPreferencesFilePath(
  environment: NodeJS.ProcessEnv,
): string {
  return path.resolve(
    environment.TCTBP_ADVISER_PREFERENCES_FILE
      ?? path.join(os.homedir(), '.config', 'tctbp-adviser', 'portfolio-preferences.json'),
  )
}
