import type {
  AppSettingsResponse,
  AppSettingsUpdate,
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
