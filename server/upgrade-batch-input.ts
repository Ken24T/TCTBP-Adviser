import type { IncomingMessage } from 'node:http'
import type { UpgradeBatchRequest } from '../shared/upgrade-batch'
import { AdviserError } from './errors'

/** Reads the upgrade-batch start request: confirmation + Jasper handshake. */
export async function readUpgradeBatchRequest(
  request: IncomingMessage,
): Promise<UpgradeBatchRequest> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 16 * 1024) {
      throw new AdviserError(
        'request-body-too-large',
        'Upgrade batch request exceeds the input limit.',
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
      'Upgrade batch request must contain valid JSON.',
      { cause: error },
    )
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AdviserError(
      'request-body-invalid',
      'Upgrade batch request must contain an object.',
    )
  }
  const record = body as Record<string, unknown>
  const allowedKeys = new Set([
    'confirm',
    'aiReviewId',
    'aiReviewAcknowledged',
    'planFingerprint',
  ])
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw new AdviserError(
      'request-body-invalid',
      'Upgrade batch request contains unsupported fields.',
    )
  }
  if (
    record.confirm !== true
    || record.aiReviewAcknowledged !== true
    || typeof record.aiReviewId !== 'string'
    || record.aiReviewId.length === 0
    || typeof record.planFingerprint !== 'string'
    || record.planFingerprint.length === 0
  ) {
    throw new AdviserError(
      'request-confirmation-required',
      'Upgrade batch requires explicit confirmation and an acknowledged Jasper review.',
    )
  }
  return {
    confirm: true,
    aiReviewId: record.aiReviewId,
    aiReviewAcknowledged: true,
    planFingerprint: record.planFingerprint,
  }
}
