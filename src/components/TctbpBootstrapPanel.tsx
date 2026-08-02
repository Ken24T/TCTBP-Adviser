import { useState } from 'react'
import type {
  TctbpBootstrapBranchStrategy,
  TctbpBootstrapPlan,
  TctbpBootstrapRequest,
} from '../../shared/tctbp-bootstrap'

interface TctbpBootstrapPanelProps {
  repositoryName: string
  busy: boolean
  plan: TctbpBootstrapPlan | null
  onPrepare: (request: TctbpBootstrapRequest) => void
}

export function TctbpBootstrapPanel({
  repositoryName,
  busy,
  plan,
  onPrepare,
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

  function submit(): void {
    onPrepare({
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
    })
  }

  return (
    <section className="bootstrap-plan" aria-label="TCTBP bootstrap configuration">
      <strong>Configure bootstrap</strong>
      <p>Choose the target-specific settings before generating the installation plan.</p>
      <label className="bootstrap-field">
        <span>Project description</span>
        <input value={projectDescription} onChange={(event) => setProjectDescription(event.currentTarget.value)} placeholder="Describe this project" />
      </label>
      <label className="bootstrap-field">
        <span>Branch strategy</span>
        <select value={branchStrategy} onChange={(event) => changeStrategy(event.currentTarget.value as TctbpBootstrapBranchStrategy)}>
          <option value="long-lived-environment-branches">development → review → main</option>
          <option value="staged">development → staging → main</option>
          <option value="simple">main only</option>
        </select>
      </label>
      {branchStrategy !== 'simple' && (
        <label className="bootstrap-field">
          <span>Pre-production branch</span>
          <input value={preProductionBranch} onChange={(event) => setPreProductionBranch(event.currentTarget.value)} />
        </label>
      )}
      <label className="bootstrap-field">
        <span>Test command</span>
        <input value={testCommand} onChange={(event) => setTestCommand(event.currentTarget.value)} />
      </label>
      <label className="bootstrap-field">
        <span>Build command</span>
        <input value={buildCommand} onChange={(event) => setBuildCommand(event.currentTarget.value)} />
      </label>
      <button className="upgrade-plan-button" disabled={busy} type="button" onClick={submit}>
        {busy ? 'Preparing bootstrap plan…' : 'Prepare bootstrap plan'}
      </button>
      {plan && (
        <p>
          Plan ready for <code>{plan.recommendedBranch ?? 'a dedicated branch'}</code>.
          Installation remains a separate approved step.
        </p>
      )}
    </section>
  )
}
