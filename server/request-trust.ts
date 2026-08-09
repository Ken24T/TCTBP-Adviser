import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { AdviserError } from './errors'

export function enforceRequestTrust(
  request: IncomingMessage,
  expectedToken: string,
): void {
  const host = request.headers.host
  if (!host || !isLoopbackHost(host)) {
    throw new AdviserError(
      'request-host-rejected',
      'Request Host is not permitted.',
    )
  }

  const origin = request.headers.origin
  if (origin) {
    let originHost: string
    try {
      originHost = new URL(origin).host
    } catch {
      throw new AdviserError(
        'request-origin-rejected',
        'Request Origin is invalid.',
      )
    }
    if (originHost !== host || !isLoopbackHost(originHost)) {
      throw new AdviserError(
        'request-origin-rejected',
        'Request Origin is not permitted.',
      )
    }
  }

  const suppliedToken = request.headers['x-tctbp-session']
    ?? sessionCookie(request.headers.cookie)
  if (
    typeof suppliedToken !== 'string'
    || !tokensMatch(suppliedToken, expectedToken)
  ) {
    throw new AdviserError(
      'session-token-invalid',
      'Session token is missing or invalid.',
    )
  }
}

function sessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (name === 'tctbp_session') {
      return valueParts.join('=')
    }
  }
  return undefined
}

function isLoopbackHost(hostHeader: string): boolean {
  try {
    const host = new URL(`http://${hostHeader}`).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  } catch {
    return false
  }
}

function tokensMatch(supplied: string, expected: string): boolean {
  const suppliedBuffer = Buffer.from(supplied)
  const expectedBuffer = Buffer.from(expected)
  return (
    suppliedBuffer.length === expectedBuffer.length
    && timingSafeEqual(suppliedBuffer, expectedBuffer)
  )
}
