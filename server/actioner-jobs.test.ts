import { describe, expect, it } from 'vitest'
import { ActionerJobStore } from './actioner-jobs'

describe('Actioner job store', () => {
  it('tracks checkpoint progress and scopes jobs to a repository', () => {
    const store = new ActionerJobStore(10, () => new Date('2026-08-03T00:00:00.000Z'), () => 'job-1')
    const job = store.create('repo-1', 'checkpoint')
    store.start(job.jobId)
    store.progress(job.jobId, 'validate', 'Preflight passed.')
    store.progress(job.jobId, 'execute', 'Creating commit.')
    const completed = store.complete(job.jobId, {
      workflowId: 'checkpoint',
      commitSha: 'a'.repeat(40),
      branch: 'development',
      pushed: false,
      remote: null,
      verifiedClean: true,
      summary: 'Local checkpoint created; no push performed.',
    })

    expect(completed).toMatchObject({
      jobId: 'job-1',
      repositoryId: 'repo-1',
      status: 'completed',
    })
    expect(store.get(job.jobId, 'repo-1')?.status).toBe('completed')
    expect(store.get(job.jobId, 'other-repo')).toBeNull()
  })
})
