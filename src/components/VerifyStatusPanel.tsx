import type { ReactNode } from 'react'
import type { StatusVerifyResult } from '../../shared/status-verify'
import { Badge, Card } from './primitives'
import { CloseIcon } from './icons'

interface VerifyStatusPanelProps {
  result: StatusVerifyResult
  onClose: () => void
}

/**
 * Compact result card for the on-demand "Verify with status" audit: runs the
 * repository's own canonical status runner read-only and surfaces the parsed
 * contract-v1 facts it produced (or why it could not run).
 */
export function VerifyStatusPanel({ result, onClose }: VerifyStatusPanelProps) {
  if (!result.ok) {
    return (
      <Card className="border border-amber-200 bg-amber-50">
        <VerifyHeader
          onClose={onClose}
          pill={<Badge tone="warning">Could not verify</Badge>}
        />
        <p className="text-sm text-text-secondary">{result.message}</p>
        {result.exitCode !== null && (
          <p className="mt-1 text-xs text-text-muted">
            Runner exited with code {result.exitCode}.
          </p>
        )}
      </Card>
    )
  }
  if (!result.document) return null
  const { observation, contract } = result.document
  const version = observation.repository.versionSource
    ? `${observation.repository.versionSource} = ${observation.repository.tctbpVersion ?? 'Unknown'}`
    : 'Unavailable'
  return (
    <Card>
      <VerifyHeader
        onClose={onClose}
        pill={<Badge tone="success">Runner passed</Badge>}
      />
      <p className="text-xs text-text-muted">
        <code className="px-1.5 py-0.5 bg-surface-inset rounded">
          node scripts/tctbp-run-status.js --no-fetch --json
        </code>{' '}
        exited 0{contract ? ` · contract v${contract.major}.${contract.minor}` : ''}.
      </p>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
        <VerifyFact label="Version source" value={version} />
        <VerifyFact
          label="Schema"
          value={observation.repository.tctbpSchemaVersion?.toString() ?? 'Unknown'}
        />
        <VerifyFact
          label="HEAD"
          value={`${observation.head.branch ?? 'detached'} @ ${observation.head.sha?.slice(0, 8) ?? 'n/a'}`}
        />
        <VerifyFact
          label="Working tree"
          value={observation.workingTree.clean
            ? 'Clean'
            : `${observation.workingTree.pathCount} changed paths`}
        />
        <VerifyFact
          label="Release"
          value={observation.release.reachableTag ?? 'None reachable'}
        />
        <VerifyFact
          label="Fetch"
          value={observation.fetchPerformed ? 'Performed' : 'None — read-only'}
        />
      </div>

      {observation.statusAdvice.tokens.length > 0 && (
        <p className="mt-4 text-sm text-text-secondary">
          Status advice: <code className="text-text-primary">{observation.statusAdvice.tokens.join(' · ')}</code>
        </p>
      )}
      {observation.activeGuardrails.length > 0 && (
        <p className="mt-2 text-xs text-text-muted">
          Active guardrails: {observation.activeGuardrails.join(', ')}
        </p>
      )}
      {result.document.errors.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          The runner reported {result.document.errors.length} error(s).
        </p>
      )}
    </Card>
  )
}

function VerifyHeader({
  pill,
  onClose,
}: {
  pill: ReactNode
  onClose: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-text-primary">
          TCTBP status verification
        </h2>
        {pill}
      </div>
      <button
        aria-label="Dismiss verification result"
        className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        type="button"
        onClick={onClose}
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

function VerifyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-surface-soft rounded-lg">
      <span className="block text-xs text-text-muted">{label}</span>
      <strong className="block mt-0.5 text-sm text-text-primary break-all">{value}</strong>
    </div>
  )
}
