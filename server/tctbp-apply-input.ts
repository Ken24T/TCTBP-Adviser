import type { IncomingMessage } from 'node:http'
import type {
  TctbpApplyMode,
  TctbpApplyRequest,
} from '../shared/tctbp-upgrade'
import { AdviserError } from './errors'

export async function readTctbpApplyRequest(
  request: IncomingMessage,
): Promise<TctbpApplyRequest> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 16 * 1024) {
      throw new AdviserError(
        'request-body-too-large',
        'TCTBP apply request exceeds the input limit.',
      )
    }
    chunks.push(buffer)
  }

  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    throw new AdviserError(
      'request-json-invalid',
      'TCTBP apply request must contain valid JSON.',
      { cause: error },
    )
  }
  if (
    typeof body !== 'object'
    || body === null
    || Array.isArray(body)
  ) {
    throw new AdviserError(
      'request-body-invalid',
      'TCTBP apply request must contain an object.',
    )
  }

  const record = body as Record<string, unknown>
  const allowedKeys = new Set([
    'confirm',
    'aiReviewId',
    'aiReviewAcknowledged',
    'planFingerprint',
    'mode',
    'approvedPaths',
    'approvedDeletionPaths',
    'confirmDeletions',
  ])
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new AdviserError(
      'request-body-invalid',
      'TCTBP apply request contains unsupported fields.',
    )
  }
  if (record.confirm !== true || record.aiReviewAcknowledged !== true) {
    throw new AdviserError(
      'request-confirmation-required',
      'TCTBP apply requires explicit confirmation and an acknowledged Jasper review.',
    )
  }
  if (typeof record.aiReviewId !== 'string' || record.aiReviewId.length === 0) {
    throw new AdviserError(
      'request-ai-review-invalid',
      'TCTBP apply requires a valid Jasper review identifier.',
    )
  }
  if (
    typeof record.planFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(record.planFingerprint)
  ) {
    throw new AdviserError(
      'request-plan-invalid',
      'TCTBP apply requires a valid plan fingerprint.',
    )
  }
  if (record.mode !== 'additions-only' && record.mode !== 'approved-managed-files') {
    throw new AdviserError(
      'request-mode-invalid',
      'TCTBP apply mode is not supported.',
    )
  }
  if (
    !Array.isArray(record.approvedPaths)
    || record.approvedPaths.some(
      (value) => typeof value !== 'string' || value.length === 0,
    )
  ) {
    throw new AdviserError(
      'request-paths-invalid',
      'TCTBP apply approvedPaths must be an array of non-empty strings.',
    )
  }
  if (
    !Array.isArray(record.approvedDeletionPaths)
    || record.approvedDeletionPaths.some(
      (value) => typeof value !== 'string' || value.length === 0,
    )
    || typeof record.confirmDeletions !== 'boolean'
  ) {
    throw new AdviserError(
      'request-deletion-approval-invalid',
      'TCTBP apply deletion approval is invalid.',
    )
  }

  return {
    confirm: true,
    aiReviewId: record.aiReviewId,
    aiReviewAcknowledged: true,
    planFingerprint: record.planFingerprint,
    mode: record.mode as TctbpApplyMode,
    approvedPaths: Array.from(new Set(record.approvedPaths as string[])),
    approvedDeletionPaths: Array.from(
      new Set(record.approvedDeletionPaths as string[]),
    ),
    confirmDeletions: record.confirmDeletions,
  }
}
