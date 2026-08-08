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
  const [excludes, setExcludes] = useState<string[]>([])
  const [maxDepth, setMaxDepth] = useState('')
  const [canonicalRoot, setCanonicalRoot] = useState('')
  const [githubEnabled, setGithubEnabled] = useState(false)
  const [githubRepos, setGithubRepos] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadAppSettings()
      .then((loaded) => {
        if (cancelled) return
        applyLoadedSettings(loaded)
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

  function applyLoadedSettings(loaded: AppSettingsResponse): void {
    setSettings(loaded)
    setRoots(loaded.repositoryRoots.persisted)
    setExcludes(loaded.excludeDirectories.persisted)
    setMaxDepth(
      loaded.maximumDepth.persisted === null
        ? ''
        : String(loaded.maximumDepth.persisted),
    )
    setCanonicalRoot(loaded.canonicalTctbpWebRoot.persisted ?? '')
    setGithubEnabled(
      loaded.githubEnabled.persisted ?? loaded.githubEnabled.effective,
    )
    setGithubRepos(loaded.githubRepositories.persisted)
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const depth = maxDepth.trim() === '' ? null : Number(maxDepth)
      const updated = await saveAppSettings({
        repositoryRoots: roots,
        excludeDirectories: excludes,
        maximumDepth: depth,
        canonicalTctbpWebRoot: canonicalRoot.trim() === '' ? null : canonicalRoot.trim(),
        githubEnabled,
        githubRepositories: githubRepos,
      })
      applyLoadedSettings(updated)
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

  const locked = {
    roots: settings.repositoryRoots.source === 'environment',
    excludes: settings.excludeDirectories.source === 'environment',
    maxDepth: settings.maximumDepth.source === 'environment',
    canonicalRoot: settings.canonicalTctbpWebRoot.source === 'environment',
    githubEnabled: settings.githubEnabled.source === 'environment',
    githubRepos: settings.githubRepositories.source === 'environment',
  }
  const editable = Object.values(locked).some((value) => !value)

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
        <SettingsHeading
          title="Repository roots"
          description="Local directories scanned for repositories. Absolute paths only."
          locked={locked.roots}
        />
        {locked.roots ? (
          <ReadOnlyList values={settings.repositoryRoots.effective} />
        ) : (
          <ListField
            ariaLabel="Repository root"
            locked={locked.roots}
            onChange={setRoots}
            placeholder="/absolute/path/to/repositories"
            values={roots}
          />
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <SettingsHeading
          title="Discovery"
          description="Directories skipped while scanning and the maximum scan depth."
          locked={locked.excludes && locked.maxDepth}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-widest text-text-muted">
              Excluded directories
            </span>
            {locked.excludes ? (
              <ReadOnlyList values={settings.excludeDirectories.effective} />
            ) : (
              <ListField
                ariaLabel="Excluded directory"
                locked={locked.excludes}
                onChange={setExcludes}
                placeholder="build"
                values={excludes}
              />
            )}
          </div>
          <div className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-widest text-text-muted">
              Maximum depth
            </span>
            {locked.maxDepth ? (
              <p className="px-3 py-2 text-sm text-text-secondary font-mono bg-surface-soft border border-border rounded-lg">
                {settings.maximumDepth.effective}
              </p>
            ) : (
              <input
                aria-label="Maximum depth"
                className="w-full px-3 py-2 text-sm text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint"
                min={0}
                max={10}
                onChange={(event) => {
                  setMaxDepth(event.currentTarget.value)
                  setSaved(false)
                }}
                placeholder="Default (3)"
                type="number"
                value={maxDepth}
              />
            )}
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <SettingsHeading
          title="TCTBP reference"
          description="The pinned TCTBP-Web checkout that feeds the reference catalogue."
          locked={locked.canonicalRoot}
        />
        {locked.canonicalRoot ? (
          <p className="px-3 py-2 text-sm text-text-secondary font-mono bg-surface-soft border border-border rounded-lg">
            {settings.canonicalTctbpWebRoot.effective ?? 'Not configured'}
          </p>
        ) : (
          <input
            aria-label="TCTBP-Web root"
            className="w-full px-3 py-2 text-sm text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint font-mono"
            onChange={(event) => {
              setCanonicalRoot(event.currentTarget.value)
              setSaved(false)
            }}
            placeholder="/absolute/path/to/TCTBP-Web (optional)"
            type="text"
            value={canonicalRoot}
          />
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <SettingsHeading
          title="GitHub enrichment"
          description="Fetch read-only evidence for repositories published on GitHub."
          locked={locked.githubEnabled && locked.githubRepos}
        />
        {locked.githubEnabled ? (
          <p className="px-3 py-2 text-sm text-text-secondary font-mono bg-surface-soft border border-border rounded-lg">
            {settings.githubEnabled.effective ? 'Enabled' : 'Disabled'}
          </p>
        ) : (
          <label className="flex items-center gap-3 text-sm text-text-secondary">
            <input
              aria-label="Enable GitHub enrichment"
              checked={githubEnabled}
              className="w-4 h-4 rounded accent-teal-600"
              onChange={(event) => {
                setGithubEnabled(event.currentTarget.checked)
                setSaved(false)
              }}
              type="checkbox"
            />
            Enabled
          </label>
        )}
        <div className="space-y-2">
          <span className="block text-xs font-bold uppercase tracking-widest text-text-muted">
            GitHub repositories
          </span>
          {locked.githubRepos ? (
            <ReadOnlyList values={settings.githubRepositories.effective} />
          ) : (
            <ListField
              ariaLabel="GitHub repository"
              locked={locked.githubRepos}
              onChange={setGithubRepos}
              placeholder="owner/repository"
              values={githubRepos}
            />
          )}
        </div>
      </Card>

      {editable && (
        <div className="flex items-center gap-4">
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
    </div>
  )
}

function SettingsHeading({
  title,
  description,
  locked,
}: {
  title: string
  description: string
  locked: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      </div>
      <span
        className={[
          'text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap',
          locked
            ? 'bg-surface-soft text-text-secondary border border-border'
            : 'bg-teal-600 text-white',
        ].join(' ')}
      >
        {locked ? 'Environment managed' : 'Editable'}
      </span>
    </div>
  )
}

function ReadOnlyList({ values }: { values: string[] }) {
  if (values.length === 0) {
    return (
      <p className="text-sm text-text-faint">None configured.</p>
    )
  }
  return (
    <ul className="space-y-2">
      {values.map((value) => (
        <li
          key={value}
          className="px-3 py-2 text-sm text-text-secondary font-mono bg-surface-soft border border-border rounded-lg"
        >
          {value}
        </li>
      ))}
    </ul>
  )
}

function ListField({
  ariaLabel,
  values,
  placeholder,
  locked,
  onChange,
}: {
  ariaLabel: string
  values: string[]
  placeholder: string
  locked: boolean
  onChange: (values: string[]) => void
}) {
  const update = (index: number, value: string) => {
    onChange(values.map((entry, candidate) => (
      candidate === index ? value : entry
    )))
  }
  return (
    <div className="space-y-2">
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            aria-label={`${ariaLabel} ${index + 1}`}
            className="flex-1 px-3 py-2 text-sm text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint font-mono disabled:opacity-50"
            disabled={locked}
            onChange={(event) => update(index, event.currentTarget.value)}
            placeholder={placeholder}
            type="text"
            value={value}
          />
          <button
            aria-label={`Remove ${ariaLabel} ${index + 1}`}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
            disabled={locked}
            type="button"
            onClick={() => onChange(values.filter((_, candidate) => candidate !== index))}
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        className="px-3 py-1.5 text-xs font-medium rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border transition-colors disabled:opacity-50"
        disabled={locked}
        type="button"
        onClick={() => onChange([...values, ''])}
      >
        Add {ariaLabel}
      </button>
    </div>
  )
}
