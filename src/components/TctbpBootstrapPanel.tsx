import { useState } from 'react'
import type {
  TctbpBootstrapBranchStrategy,
  TctbpBootstrapJob,
  TctbpBootstrapPlan,
  TctbpBootstrapRequest,
} from '../../shared/tctbp-bootstrap'
import { Button, Card } from './primitives'

interface TctbpBootstrapPanelProps {
  repositoryName: string
  busy: boolean
  applyBusy: boolean
  plan: TctbpBootstrapPlan | null
  applyFeedback: string | null
  job: TctbpBootstrapJob | null
  aiApplyReady: boolean
  onPrepare: (request: TctbpBootstrapRequest) => void
  onApply: (request: TctbpBootstrapRequest) => void
}

export function TctbpBootstrapPanel({
  repositoryName,
  busy,
  applyBusy,
  plan,
  applyFeedback,
  job,
  aiApplyReady,
  onPrepare,
  onApply,
}: TctbpBootstrapPanelProps) {
  const [branchStrategy, setBranchStrategy] = useState<TctbpBootstrapBranchStrategy>(
    'long-lived-environment-branches',
  )
  const [preProductionBranch, setPreProductionBranch] = useState('review')
  const [projectDescription, setProjectDescription] = useState('')
  const [testCommand, setTestCommand] = useState('npm run test')
  const [buildCommand, setBuildCommand] = useState('npm run build')

  function changeStrategy(next: TctbpBootstrapBranchStrategy): void {
    setBranchStrategy(next)
    if (next === 'simple') setPreProductionBranch('')
    else if (!preProductionBranch) setPreProductionBranch(next === 'staged' ? 'staging' : 'review')
  }

  function currentRequest(): TctbpBootstrapRequest {
    return requestFromState(
      repositoryName,
      projectDescription,
      branchStrategy,
      preProductionBranch,
      testCommand,
      buildCommand,
    )
  }

  return (
    <section className="mb-4 p-4 bg-surface-soft border border-border rounded-lg" aria-label="TCTBP bootstrap configuration">
      <strong className="block text-sm font-semibold text-text-primary mb-1">Configure bootstrap</strong>
      <p className="text-sm text-text-secondary mb-4">
        Choose the target-specific settings before generating the installation plan.
      </p>

      <div className="space-y-3 mb-4">
        <label className="block text-sm text-text-secondary">
          Project description
          <input
            className="mt-1 w-full px-3 py-2 text-sm text-text-primary bg-surface-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-text-faint"
            onChange={(event) => setProjectDescription(event.currentTarget.value)}
            placeholder="Describe this project"
            value={projectDescription}
          />
        </label>

        <label className="block text-sm text-text-secondary">
          Branch strategy
          <select
            className="mt-1 w-full px-3 py-2 text-sm text-text-primary bg-surface-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            onChange={(event) => changeStrategy(event.currentTarget.value as TctbpBootstrapBranchStrategy)}
            value={branchStrategy}
          >
            <option value="long-lived-environment-branches">development → review → main</option>
            <option value="staged">development → staging → main</option>
            <option value="simple">main only</option>
          </select>
        </label>

        {branchStrategy !== 'simple' && (
          <label className="block text-sm text-text-secondary">
            Pre-production branch
            <input
              className="mt-1 w-full px-3 py-2 text-sm text-text-primary bg-surface-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              onChange={(event) => setPreProductionBranch(event.currentTarget.value)}
              value={preProductionBranch}
            />
          </label>
        )}

        <label className="block text-sm text-text-secondary">
          Test command
          <input
            className="mt-1 w-full px-3 py-2 text-sm text-text-primary bg-surface-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            onChange={(event) => setTestCommand(event.currentTarget.value)}
            value={testCommand}
          />
        </label>

        <label className="block text-sm text-text-secondary">
          Build command
          <input
            className="mt-1 w-full px-3 py-2 text-sm text-text-primary bg-surface-elevated border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            onChange={(event) => setBuildCommand(event.currentTarget.value)}
            value={buildCommand}
          />
        </label>
      </div>

      <Button disabled={busy} onClick={() => onPrepare(currentRequest())} size="sm">
        {busy ? 'Preparing bootstrap plan…' : 'Prepare bootstrap plan'}
      </Button>

      {job && <BootstrapProgressReport job={job} />}

      {plan && (
        <>
          <p className="mt-4 text-sm text-text-secondary">
            Plan ready for <code className="text-xs bg-surface-inset px-1.5 py-0.5 rounded">{plan.recommendedBranch ?? 'a dedicated branch'}</code>.
          </p>
          <Button
            className="mt-2"
            disabled={
              applyBusy
              || !aiApplyReady
              || !plan.fingerprint
              || plan.targetClean !== true
              || plan.targetDetached === true
              || (plan.activeOperationCount ?? 0) > 0
            }
            onClick={() => onApply(currentRequest())}
            size="sm"
            variant="secondary"
          >
            {applyBusy ? 'Applying bootstrap…' : 'Apply bootstrap (no commit/push)'}
          </Button>
          {applyFeedback && (
            <p className="mt-2 p-2 text-sm bg-surface-elevated border border-border rounded text-text-secondary">
              {applyFeedback}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function BootstrapProgressReport({ job }: { job: TctbpBootstrapJob }) {
  const status = job.status === 'completed' ? 'success'
    : job.status === 'failed' ? 'danger'
    : job.status === 'running' ? 'info'
    : 'neutral'

  return (
    <Card className="mt-4 p-4" aria-live="polite" aria-label="Bootstrap progress">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${
          status === 'success' ? 'bg-teal-500'
          : status === 'danger' ? 'bg-red-500'
          : status === 'info' ? 'bg-blue-500'
          : 'bg-ink-400'
        }`} />
        <strong className="text-sm text-text-primary">
          Bootstrap {job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'failed' : 'running'}
        </strong>
      </div>
      <ol className="space-y-2">
        {job.steps.map((step) => {
          const icon = step.status === 'completed' ? '✓'
            : step.status === 'failed' ? '!'
            : step.status === 'running' ? '…'
            : '○'
          return (
            <li key={step.id} className="flex items-start gap-2 text-sm">
              <span className="text-text-muted" aria-hidden="true">{icon}</span>
              <div>
                <strong className={step.status === 'completed' ? 'text-text-primary' : 'text-text-secondary'}>
                  {step.label}
                </strong>
                {step.detail && <small className="block text-text-faint"> — {step.detail}</small>}
              </div>
            </li>
          )
        })}
      </ol>
      {job.error && (
        <p className="mt-2 p-2 text-sm bg-red-50 text-red-900 rounded border border-red-200">
          {job.error}
        </p>
      )}
    </Card>
  )
}

function requestFromState(
  repositoryName: string,
  projectDescription: string,
  branchStrategy: TctbpBootstrapBranchStrategy,
  preProductionBranch: string,
  testCommand: string,
  buildCommand: string,
): TctbpBootstrapRequest {
  return {
    projectName: repositoryName,
    projectDescription,
    branchStrategy,
    workingBranch: 'development',
    preProductionBranch: branchStrategy === 'simple' ? null : preProductionBranch,
    productionBranch: 'main',
    testCommand: testCommand.trim() || null,
    buildCommand: buildCommand.trim() || null,
    deployEnabled: false,
    includeHookLayer: true,
  }
}
