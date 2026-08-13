import { useState } from 'react'
import type { GithubAccessStatus } from '../../shared/app-settings'
import { testGithubAccess } from '../api'
import { Button, Card } from './primitives'

interface GitHubAccessSettingsProps {
  access: GithubAccessStatus
  visibility: 'private' | 'public' | null
  onVisibilityChange: (value: 'private' | 'public' | null) => void
}

/**
 * GitHub access settings for write-capable actions (e.g. creating remote-less
 * repositories). The token is always read from the environment — the app only
 * ever shows status (configured/authenticated/account/scopes), never the value.
 */
export function GitHubAccessSettings({
  access,
  visibility,
  onVisibilityChange,
}: GitHubAccessSettingsProps) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const statusLabel = !access.configured
    ? 'No token configured'
    : access.authenticated
      ? 'Authenticated'
      : 'Authentication failed'
  const statusTone = access.authenticated ? 'success'
    : access.configured ? 'warning'
    : 'neutral'

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const fresh = await testGithubAccess()
      setTestResult(fresh.authenticated
        ? `Connected as ${fresh.account?.login ?? 'unknown'}.`
        : fresh.message ?? 'GitHub access check failed.')
    } catch (cause) {
      setTestResult(
        cause instanceof Error ? cause.message : 'GitHub access test failed.',
      )
    } finally {
      setTesting(false)
    }
  }

  const canCreate = access.canCreateRepositories

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">GitHub access</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Write access used when the Adviser creates repositories on GitHub.
            The token is read from the environment and never stored by the app.
          </p>
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap ${
            statusTone === 'success'
              ? 'bg-teal-600 text-white'
              : statusTone === 'warning'
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'bg-surface-soft text-text-secondary border border-border'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <span className="block text-xs font-bold uppercase tracking-widest text-text-muted">
            Connected account
          </span>
          {access.account ? (
            <p className="text-sm text-text-primary">
              {access.account.login}
              {access.account.name ? ` — ${access.account.name}` : ''}
            </p>
          ) : (
            <p className="text-sm text-text-secondary">No account connected.</p>
          )}
          {access.configured && access.authenticated && (
            <p className="text-xs text-text-faint">
              Can create repositories:{' '}
              {canCreate === null
                ? 'unknown (fine-grained token)'
                : canCreate ? 'yes' : 'no'}
              {access.scopes.length > 0
                ? ` · scopes: ${access.scopes.join(', ')}`
                : ''}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <span className="block text-xs font-bold uppercase tracking-widest text-text-muted">
            New repositories
          </span>
          <select
            aria-label="New repository visibility"
            className="w-full px-3 py-2 text-sm text-text-primary bg-surface-soft border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            onChange={(event) => (
              onVisibilityChange(
                event.currentTarget.value as 'private' | 'public',
              )
            )}
            value={visibility ?? 'private'}
          >
            <option value="private">Private (recommended)</option>
            <option value="public">Public</option>
          </select>
          {visibility === null && (
            <p className="text-xs text-text-faint">Using default: private.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={testing}
          onClick={() => void test()}
          size="sm"
          variant="secondary"
        >
          {testing ? 'Testing…' : 'Test GitHub access'}
        </Button>
        {testResult && (
          <span className="text-xs text-text-secondary" role="status">
            {testResult}
          </span>
        )}
      </div>
    </Card>
  )
}
