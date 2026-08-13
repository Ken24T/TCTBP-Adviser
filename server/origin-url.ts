import { AdviserError } from './errors'

const GIT_URL_PROTOCOLS = new Set(['http:', 'https:', 'ssh:', 'git:'])

/**
 * Validates a user-supplied git remote URL for the "add origin" action.
 * Accepts scp-like syntax (`git@host:owner/repo.git`) and absolute URLs using
 * http, https, ssh, or git. Rejects empty, whitespace, control characters,
 * and unsupported schemes before any git command runs.
 */
export function validateOriginUrl(candidate: string): string {
  const value = candidate.trim()
  if (!value || /\s/.test(value)) {
    throw new AdviserError(
      'origin-url-invalid',
      'Origin URL must be a single, non-empty git remote URL.',
    )
  }
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new AdviserError(
      'origin-url-invalid',
      'Origin URL must not contain control characters.',
    )
  }
  // scp-like: user@host:path (git@github.com:owner/repo.git)
  if (/^[^@\s]+@[^:\s]+:.+$/.test(value)) {
    return value
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new AdviserError(
      'origin-url-invalid',
      'Origin URL is not a valid git remote URL.',
    )
  }
  if (!GIT_URL_PROTOCOLS.has(parsed.protocol)) {
    throw new AdviserError(
      'origin-url-invalid',
      'Origin URL must use http, https, ssh, or git.',
    )
  }
  return value
}
