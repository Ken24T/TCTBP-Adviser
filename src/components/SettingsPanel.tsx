import { useEffect, useState } from 'react'
import type { AppSettingsResponse } from '../../shared/app-settings'
import { loadAppSettings, saveAppSettings } from '../api-client'
import { Button, Card, PageHeader } from './primitives'
import { CloseIcon } from './icons'

interface SettingsPanelProps {
  onBack: () => void
  onSaved: () => void
}

export function SettingsPanel({ onBack, onSaved }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettingsResponse | null>(null)
  const [roots, setRoots] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadAppSettings()
      .then((loaded) => {
        if (cancelled) return
        setSettings(loaded)
        setRoots(loaded.persistedRoots)
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Settings could not be loaded.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const updateRoot = (index: number, value: string) => {
    setRoots((current) => (
      current.map((root, candidate) => (
        candidate === index ? value : root
      ))
    ))
    setSaved(false)
  }

  const addRoot = () => {
    setRoots((current) => [...current, ''])
    setSaved(false)
  }

  const removeRoot = (index: number) => {
    setRoots((current) => current.filter((_, candidate) => candidate !== index))
    setSaved(false)
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await saveAppSettings(roots)
      setSettings(updated)
      setRoots(updated.persistedRoots)
      setSaved(true)
      onSaved()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Settings could not be saved.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!settings) {
    return (
      <div className="space-y-8 animate-fade-in">
        <PageHeader
          description="Loading current configuration…"
          eyebrow="Application settings"
          onBack={onBack}
          title="App settings"
        />
      </div>
    )
  }

  const readOnly = settings.source === 'environment'

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        description="Configure which local directories the Adviser scans for repositories."
        eyebrow="Application settings"
        onBack={onBack}
        title="App settings"
      />

      {error && (
        <section
          role="alert"
          className="ad-surface p-5 border-l-4 border-red-500"
        >
          <p className="text-sm text-text-secondary">{error}</p>
        </section>
      )}

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Repository roots</h2>
            <p className="mt-1 text-sm text-text-secondary">
              {readOnly
                ? 'Managed by the server environment and read-only in the Adviser.'
                : 'Local directories scanned for repositories. Absolute paths only.'}
            </p>
          </div>
          <span
            className={[
              'text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap',
              readOnly
                ? 'bg-surface-soft text-text-secondary border border-border'
                : 'bg-teal-600 text-white',
            ].join(' ')}
          >
            {readOnly ? 'Environment managed' : 'Editable'}
          </span>
        </div>

        {readOnly ? (
          <ul className="space-y-2">
            {settings.repositoryRoots.map((root) => (
              <li
                key={root}
                className="px-3 py-2 text-sm text-text-secondary font-mono bg-surface-soft border border-border rounded-lg"
              >
                {root}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2">
            {roots.map((root, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  aria-label={`Repository root ${index + 1}`}
                  className="flex-1 px-3 py-2 text-sm text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint font-mono"
                  onChange={(event) => updateRoot(index, event.currentTarget.value)}
                  placeholder="/absolute/path/to/repositories"
                  type="text"
                  value={root}
                />
                <button
                  aria-label={`Remove repository root ${index + 1}`}
                  className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                  type="button"
                  onClick={() => removeRoot(index)}
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border transition-colors"
              type="button"
              onClick={addRoot}
            >
              Add repository root
            </button>
          </div>
        )}

        {!readOnly && (
          <div className="flex items-center gap-4 pt-2 border-t border-border">
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save settings'}
            </Button>
            {saved && (
              <span className="text-sm text-teal-500" role="status">
                Settings saved.
              </span>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
