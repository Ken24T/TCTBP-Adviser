import type { IncomingMessage } from 'node:http'
import type { ActionerRequest } from '../shared/actioner'
import { AdviserError } from './errors'

export async function readActionerRequest(
  request: IncomingMessage,
): Promise<ActionerRequest> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 8 * 1024) {
      throw new AdviserError('request-body-too-large', 'Actioner request exceeds the input limit.')
    }
    chunks.push(buffer)
  }
  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    throw new AdviserError('request-json-invalid', 'Actioner request must contain valid JSON.', { cause: error })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AdviserError('request-body-invalid', 'Actioner request must contain an object.')
  }
  const value = body as Record<string, unknown>
  if (
    value.workflowId !== 'checkpoint'
    || value.intent !== 'preserve-locally'
    || value.confirm !== true
    || typeof value.planFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.planFingerprint)
  ) {
    throw new AdviserError(
      'actioner-request-invalid',
      'Checkpoint action requires explicit confirmation and a valid plan fingerprint.',
    )
  }
  return {
    workflowId: 'checkpoint',
    intent: 'preserve-locally',
    planFingerprint: value.planFingerprint,
    confirm: true,
  }
}
