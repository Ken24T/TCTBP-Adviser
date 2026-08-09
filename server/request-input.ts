import type { IncomingMessage } from 'node:http'
import {
  RECOMMENDATION_INTENTS,
  type RecommendationIntent,
} from '../shared/recommendation'
import { AdviserError } from './errors'

export async function requireEmptyBody(
  request: IncomingMessage,
): Promise<void> {
  let bytes = 0
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk)
    if (bytes > 0) {
      throw new AdviserError(
        'request-body-rejected',
        'Inspection requests do not accept a request body.',
      )
    }
  }
}

export async function readRecommendationIntent(
  request: IncomingMessage,
): Promise<RecommendationIntent> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 1024) {
      throw new AdviserError(
        'request-body-too-large',
        'Recommendation request exceeds the input limit.',
      )
    }
    chunks.push(buffer)
  }
  if (bytes === 0) return 'none'

  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    throw new AdviserError(
      'request-json-invalid',
      'Recommendation request must contain valid JSON.',
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
      'Recommendation request must contain an object.',
    )
  }
  const keys = Object.keys(body)
  if (keys.some((key) => key !== 'intent')) {
    throw new AdviserError(
      'request-body-invalid',
      'Recommendation request accepts only a fixed intent.',
    )
  }
  const intent = (body as { intent?: unknown }).intent ?? 'none'
  if (
    typeof intent !== 'string'
    || !isRecommendationIntent(intent)
  ) {
    throw new AdviserError(
      'request-intent-invalid',
      'Recommendation intent is not supported.',
    )
  }
  return intent
}

function isRecommendationIntent(
  value: string,
): value is RecommendationIntent {
  return (RECOMMENDATION_INTENTS as readonly string[]).includes(value)
}

export async function readJsonBody(
  request: IncomingMessage,
  maximumBytes = 16 * 1024,
): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > maximumBytes) {
      throw new AdviserError(
        'request-body-too-large',
        'Request body exceeds the input limit.',
      )
    }
    chunks.push(buffer)
  }
  if (bytes === 0) {
    throw new AdviserError(
      'request-body-invalid',
      'Request body is required.',
    )
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch (error) {
    throw new AdviserError(
      'request-json-invalid',
      'Request must contain valid JSON.',
      { cause: error },
    )
  }
}
