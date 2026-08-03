import type { IncomingMessage } from 'node:http'
import { validateBootstrapRequest } from './tctbp-bootstrap'
import { AdviserError } from './errors'

export async function readBootstrapRequest(
  request: IncomingMessage,
) {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 16 * 1024) {
      throw new AdviserError(
        'request-body-too-large',
        'Bootstrap request exceeds the input limit.',
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
      'Bootstrap request must contain valid JSON.',
      { cause: error },
    )
  }
  return validateBootstrapRequest(body)
}
