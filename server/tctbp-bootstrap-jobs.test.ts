import { describe, expect, it } from 'vitest'
import { TctbpBootstrapJobStore } from './tctbp-bootstrap-jobs'

describe('TCTBP bootstrap jobs', () => {
  it('records real step progress and completion safely', () => {
    const store = new TctbpBootstrapJobStore(
      10,
      () => new Date('2026-08-03T00:00:00.000Z'),
      () => 'job-1',
    )
    const job = store.create('repository-1')
    store.start(job.jobId)
    const progress = store.progress(job.jobId)
    progress('validate', 'Target is clean.')
    progress('write-managed-files', 'Writing 2/49.')
    store.complete(job.jobId, {
      status: 'applied',
      branch: 'upgrade/tctbp-bootstrap-test',
      appliedPaths: ['a', 'b'],
      planFingerprint: 'a'.repeat(64),
      committed: false,
      pushed: false,
    })

    const result = store.get(job.jobId, 'repository-1')
    expect(result?.status).toBe('completed')
    expect(result?.steps.find((step) => step.id === 'write-managed-files')).toMatchObject({
      status: 'completed',
      detail: 'Writing 2/49.',
    })
    expect(store.get(job.jobId, 'other-repository')).toBeNull()
  })
})
