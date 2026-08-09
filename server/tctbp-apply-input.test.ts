import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readTctbpApplyRequest } from './tctbp-apply-input'

describe('TCTBP apply request validation', () => {
  it('accepts an explicitly confirmed additions-only request', async () => {
    const request = await readTctbpApplyRequest(body({
      confirm: true,
      aiReviewId: 'review-id',
      aiReviewAcknowledged: true,
      planFingerprint: 'a'.repeat(64),
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    }))

    expect(request).toEqual({
      confirm: true,
      aiReviewId: 'review-id',
      aiReviewAcknowledged: true,
      planFingerprint: 'a'.repeat(64),
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    })
  })

  it('rejects requests without explicit confirmation or valid plan identity', async () => {
    await expect(readTctbpApplyRequest(body({
      confirm: false,
      planFingerprint: 'a'.repeat(64),
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    }))).rejects.toMatchObject({ code: 'request-confirmation-required' })
    await expect(readTctbpApplyRequest(body({
      confirm: true,
      aiReviewId: 'review-id',
      aiReviewAcknowledged: true,
      planFingerprint: 'stale',
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    }))).rejects.toMatchObject({ code: 'request-plan-invalid' })
  })

  it('accepts an ordered in-order steps request and deduplicates paths', async () => {
    const request = await readTctbpApplyRequest(body({
      confirm: true,
      aiReviewId: 'review-id',
      aiReviewAcknowledged: true,
      planFingerprint: 'a'.repeat(64),
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
      steps: [
        {
          mode: 'additions-only',
          approvedPaths: [],
          approvedDeletionPaths: [],
          confirmDeletions: false,
        },
        {
          mode: 'approved-managed-files',
          approvedPaths: ['scripts/tctbp-core.js', 'scripts/tctbp-core.js'],
          approvedDeletionPaths: ['scripts/old.js'],
          confirmDeletions: true,
        },
      ],
    }))

    expect(request.steps).toEqual([
      {
        mode: 'additions-only',
        approvedPaths: [],
        approvedDeletionPaths: [],
        confirmDeletions: false,
      },
      {
        mode: 'approved-managed-files',
        approvedPaths: ['scripts/tctbp-core.js'],
        approvedDeletionPaths: ['scripts/old.js'],
        confirmDeletions: true,
      },
    ])
  })

  it('rejects malformed in-order steps', async () => {
    await expect(readTctbpApplyRequest(body({
      confirm: true,
      aiReviewId: 'review-id',
      aiReviewAcknowledged: true,
      planFingerprint: 'a'.repeat(64),
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
      steps: [],
    }))).rejects.toMatchObject({ code: 'request-steps-invalid' })
    await expect(readTctbpApplyRequest(body({
      confirm: true,
      aiReviewId: 'review-id',
      aiReviewAcknowledged: true,
      planFingerprint: 'a'.repeat(64),
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
      steps: [{ mode: 'delete-everything', approvedPaths: [], approvedDeletionPaths: [], confirmDeletions: false }],
    }))).rejects.toMatchObject({ code: 'request-steps-invalid' })
  })
})

function body(value: unknown): IncomingMessage {
  return Readable.from([JSON.stringify(value)]) as unknown as IncomingMessage
}
