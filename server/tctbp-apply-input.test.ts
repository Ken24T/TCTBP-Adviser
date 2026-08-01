import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readTctbpApplyRequest } from './tctbp-apply-input'

describe('TCTBP apply request validation', () => {
  it('accepts an explicitly confirmed additions-only request', async () => {
    const request = await readTctbpApplyRequest(body({
      confirm: true,
      planFingerprint: 'a'.repeat(64),
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    }))

    expect(request).toEqual({
      confirm: true,
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
      planFingerprint: 'stale',
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    }))).rejects.toMatchObject({ code: 'request-plan-invalid' })
  })
})

function body(value: unknown): IncomingMessage {
  return Readable.from([JSON.stringify(value)]) as unknown as IncomingMessage
}
