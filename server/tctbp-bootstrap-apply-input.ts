import type { IncomingMessage } from 'node:http'
import type { TctbpBootstrapApplyRequest } from '../shared/tctbp-bootstrap'
import { AdviserError } from './errors'
import { validateBootstrapRequest } from './tctbp-bootstrap'

export async function readBootstrapApplyRequest(
  request: IncomingMessage,
): Promise<TctbpBootstrapApplyRequest> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    throw new AdviserError('request-json-invalid', 'Bootstrap apply request must contain valid JSON.', { cause: error })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AdviserError('request-body-invalid', 'Bootstrap apply request must contain an object.')
  }
  const value = body as Record<string, unknown>
  if (value.confirm !== true || typeof value.planFingerprint !== 'string' || typeof value.request !== 'object') {
    throw new AdviserError('bootstrap-confirmation-required', 'Bootstrap apply requires explicit confirmation and a plan fingerprint.')
  }
  return {
    confirm: true,
    planFingerprint: value.planFingerprint,
    request: validateBootstrapRequest(value.request),
  }
}
