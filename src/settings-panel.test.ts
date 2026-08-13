import { describe, expect, it } from 'vitest'
import type { AppSettingsField } from '../shared/app-settings'
import { editableSettingsList } from './components/SettingsPanel'

describe('editableSettingsList', () => {
  it('prefers persisted values once a save exists', () => {
    const field: AppSettingsField<string[], string[]> = {
      effective: ['/repos', '/extra'],
      persisted: ['/repos'],
      source: 'settings',
    }

    expect(editableSettingsList(field)).toEqual(['/repos'])
  })

  it('falls back to effective values before anything is persisted', () => {
    const field: AppSettingsField<string[], string[]> = {
      effective: ['/home/ken/Documents/development/repos'],
      persisted: [],
      source: 'environment',
    }

    expect(editableSettingsList(field)).toEqual([
      '/home/ken/Documents/development/repos',
    ])
  })

  it('returns an empty list when neither source has values', () => {
    const field: AppSettingsField<string[], string[]> = {
      effective: [],
      persisted: [],
      source: 'default',
    }

    expect(editableSettingsList(field)).toEqual([])
  })
})
