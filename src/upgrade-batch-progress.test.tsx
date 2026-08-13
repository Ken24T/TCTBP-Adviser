import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { UpgradeBatchRun } from '../shared/upgrade-batch'
import { UpgradeBatchProgress } from './components/UpgradeBatchProgress'

function run(overrides: Partial<UpgradeBatchRun> = {}): UpgradeBatchRun {
  return {
    runId: 'run-1',
    repositoryId: 'repo-1',
    status: 'running',
    stages: [
      { id: 'apply', label: 'Apply the upgrade', status: 'completed', detail: 'Applied 2 changes.', updatedAt: null },
      { id: 'checkpoint', label: 'Checkpoint the changes', status: 'running', detail: 'Checkpointing.', updatedAt: null },
      { id: 'publish', label: 'Publish the upgrade branch', status: 'pending', detail: null, updatedAt: null },
      { id: 'merge', label: 'Merge the upgrade branch', status: 'skipped', detail: 'No unmerged branch.', updatedAt: null },
      { id: 'cleanup', label: 'Remove the upgrade branch', status: 'pending', detail: null, updatedAt: null },
    ],
    error: null,
    startedAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

describe('upgrade batch progress', () => {
  it('renders the ordered stages with live statuses', () => {
    const markup = renderToStaticMarkup(<UpgradeBatchProgress run={run()} />)
    expect(markup).toContain('Running the upgrade journey')
    expect(markup).toContain('Apply the upgrade')
    expect(markup).toContain('Checkpoint the changes')
    expect(markup).toContain('Merge the upgrade branch')
  })

  it('renders the failure and a manual-resume hint', () => {
    const markup = renderToStaticMarkup(
      <UpgradeBatchProgress
        run={run({
          status: 'failed',
          error: 'checkpoint: Checkpoint failed.',
        })}
      />,
    )
    expect(markup).toContain('Upgrade batch stopped')
    expect(markup).toContain('checkpoint: Checkpoint failed.')
    expect(markup).toContain('Continue manually from the Take action bar above.')
  })
})
