import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ActionerJob } from '../shared/actioner'
import { ActionerProgress } from './components/ActionerProgress'

function job(workflowId: ActionerJob['workflowId']): ActionerJob {
  return {
    jobId: 'job',
    repositoryId: 'repo',
    workflowId,
    status: 'completed',
    steps: [],
    result: null,
    error: null,
    startedAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:01.000Z',
    completedAt: '2026-08-03T00:00:01.000Z',
  }
}

describe('Actioner progress labels', () => {
  it('uses the actual workflow name', () => {
    expect(renderToStaticMarkup(<ActionerProgress job={job('branch-development')} />))
      .toContain('Branch development completed')
    expect(renderToStaticMarkup(<ActionerProgress job={job('publish')} />))
      .toContain('Publish completed')
  })
})
