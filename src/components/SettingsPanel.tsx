// Over 400 lines (437): SettingsPanel deliberately keeps every settings section
// (roots, discovery, TCTBP reference, GitHub enrichment, cards) on one page with a
// single Save flow. Splitting would fragment the settings surface and duplicate the
// load/save lifecycle across components. Revisit if a section grows independently.
import { useEffect, useState } from 'react'
import type {
  AppSettingsResponse,
  AppSettingsSource,
} from '../../shared/app-settings'
import { loadAppSettings, saveAppSettings } from '../api-client'
import { Button, Card, PageHeader } from './primitives'
import { CloseIcon } from './icons'
import { CardVisibilitySettings } from './CardVisibilitySettings'
import type { PortfolioPreferences } from '../portfolio-preferences'

interface SettingsPanelProps {
  onBack: () => void
  onSaved: () => void
  repositories: Array<{
    id: string
    name: string
    directoryName?: string | null
  }>
  preferences: PortfolioPreferences
  onPreferenceChange: (
    repositoryId: string,
    patch: Partial<import('../portfolio-preferences').PortfolioPreference>,
  ) => void
}

export function SettingsPanel({
  onBack,
  onSaved,
  repositories,
  preferences,
  onPreferenceChange,
}: SettingsPanelProps) {
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

  const markDirty = () => {
    setSaved(false)
  }

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
          source={settings.repositoryRoots.source}
          title="Repository roots"
          description="Local directories scanned for repositories. Absolute paths only."
        />
        <EffectiveNote
          label="Currently scanning"
          source={settings.repositoryRoots.source}
          values={settings.repositoryRoots.effective}
        />
        <ListField
          ariaLabel="Repository root"
          onChange={(values) => {
            setRoots(values)
            markDirty()
          }}
          placeholder="/absolute/path/to/repositories"
          values={roots}
        />
      </Card>

      <Card className="p-5 space-y-4">
        <SettingsHeading
          title="Discovery"
          description="Directories skipped while scanning and the maximum scan depth."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <FieldLabel
              label="Excluded directories"
              source={settings.excludeDirectories.source}
            />
            <EffectiveNote
              label="Currently excluded"
              source={settings.excludeDirectories.source}
              values={settings.excludeDirectories.effective}
            />
            <ListField
              ariaLabel="Excluded directory"
              onChange={(values) => {
                setExcludes(values)
                markDirty()
              }}
              placeholder="build"
              values={excludes}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel
              label="Maximum depth"
              source={settings.maximumDepth.source}
            />
            <EffectiveNote
              label="Currently using depth"
              source={settings.maximumDepth.source}
              values={[String(settings.maximumDepth.effective)]}
            />
            <input
              aria-label="Maximum depth"
              className="w-full px-3 py-2 text-sm text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint"
              min={0}
              max={10}
              onChange={(event) => {
                setMaxDepth(event.currentTarget.value)
                markDirty()
              }}
              placeholder="Leave blank for default"
              type="number"
              value={maxDepth}
            />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <SettingsHeading
          source={settings.canonicalTctbpWebRoot.source}
          title="TCTBP reference"
          description="The pinned TCTBP-Web checkout that feeds the reference catalogue."
        />
        <EffectiveNote
          label="Currently"
          source={settings.canonicalTctbpWebRoot.source}
          values={
            settings.canonicalTctbpWebRoot.effective
              ? [settings.canonicalTctbpWebRoot.effective]
              : []
          }
        />
        <input
          aria-label="TCTBP-Web root"
          className="w-full px-3 py-2 text-sm text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint font-mono"
          onChange={(event) => {
            setCanonicalRoot(event.currentTarget.value)
            markDirty()
          }}
          placeholder="/absolute/path/to/TCTBP-Web (optional)"
          type="text"
          value={canonicalRoot}
        />
      </Card>

      <Card className="p-5 space-y-4">
        <SettingsHeading
          source={settings.githubEnabled.source}
          title="GitHub enrichment"
          description="Fetch read-only evidence for repositories published on GitHub."
        />
        <label className="flex items-center gap-3 text-sm text-text-secondary">
          <input
            aria-label="Enable GitHub enrichment"
            checked={githubEnabled}
            className="w-4 h-4 rounded accent-teal-600"
            onChange={(event) => {
              setGithubEnabled(event.currentTarget.checked)
              markDirty()
            }}
            type="checkbox"
          />
          Enabled
        </label>
        <div className="space-y-2">
          <FieldLabel
            label="GitHub repositories"
            source={settings.githubRepositories.source}
          />
          <EffectiveNote
            label="Currently configured"
            source={settings.githubRepositories.source}
            values={settings.githubRepositories.effective}
          />
          <ListField
            ariaLabel="GitHub repository"
            onChange={(values) => {
              setGithubRepos(values)
              markDirty()
            }}
            placeholder="owner/repository"
            values={githubRepos}
          />
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <SettingsHeading
          title="Cards"
          description="Show or hide repositories on the portfolio dashboard. Applies immediately."
        />
        <CardVisibilitySettings
          onPreferenceChange={onPreferenceChange}
          preferences={preferences}
          repositories={repositories}
        />
      </Card>

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
    </div>
  )
}

function SettingsHeading({
  title,
  description,
  source,
}: {
  title: string
  description: string
  source?: AppSettingsSource
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      </div>
      {source && <SourceTag source={source} />}
    </div>
  )
}

function FieldLabel({
  label,
  source,
}: {
  label: string
  source: AppSettingsSource
}) {
  return (
    <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted">
      {label}
      <SourceTag source={source} />
    </span>
  )
}

function SourceTag({ source }: { source: AppSettingsSource }) {
  const label = source === 'settings'
    ? 'Saved'
    : source === 'environment'
      ? 'From environment'
      : 'Default'
  return (
    <span
      className={[
        'text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap',
        source === 'settings'
          ? 'bg-teal-600 text-white'
          : 'bg-surface-soft text-text-secondary border border-border',
      ].join(' ')}
    >
      {label}
    </span>
  )
}

function EffectiveNote({
  label,
  source,
  values,
}: {
  label: string
  source: AppSettingsSource
  values: string[]
}) {
  if (source === 'settings') return null
  if (values.length === 0) {
    return <p className="text-xs text-text-faint">{label}: none.</p>
  }
  return (
    <p className="text-xs text-text-faint">
      {label}: {values.join(', ')}
    </p>
  )
}

function ListField({
  ariaLabel,
  values,
  placeholder,
  onChange,
}: {
  ariaLabel: string
  values: string[]
  placeholder: string
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
            className="flex-1 px-3 py-2 text-sm text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint font-mono"
            onChange={(event) => update(index, event.currentTarget.value)}
            placeholder={placeholder}
            type="text"
            value={value}
          />
          <button
            aria-label={`Remove ${ariaLabel} ${index + 1}`}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            type="button"
            onClick={() => onChange(values.filter((_, candidate) => candidate !== index))}
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        className="px-3 py-1.5 text-xs font-medium rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border transition-colors"
        type="button"
        onClick={() => onChange([...values, ''])}
      >
        Add {ariaLabel}
      </button>
    </div>
  )
}
