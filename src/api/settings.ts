import type {
  AppSettingsResponse,
  AppSettingsUpdate,
  GithubAccessStatus,
} from '../../shared/app-settings'
import { requestJson } from './client'

export async function loadAppSettings(): Promise<AppSettingsResponse> {
  return requestJson<AppSettingsResponse>('/api/settings')
}

export async function saveAppSettings(
  update: AppSettingsUpdate,
): Promise<AppSettingsResponse> {
  return requestJson<AppSettingsResponse>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  })
}

/** Re-checks the configured GitHub access (token status + account). */
export async function testGithubAccess(): Promise<GithubAccessStatus> {
  return requestJson<GithubAccessStatus>('/api/settings/github/test', {
    method: 'POST',
  })
}
