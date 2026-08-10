import type { ServerResponse } from 'node:http'
import { AdviserError } from './errors'

export function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const content = JSON.stringify(value)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(content)
}

const ACTIONER_CONFLICT_CODES = new Set([
  'actioner-plan-stale-or-blocked',
])

// State conflicts the caller must resolve before retrying: regenerate a
// stale plan, commit local changes, switch branches, or re-request a fresh
// Jasper review. These are expected workflow blocks, not server failures.
const CONFLICT_CODES = new Set([
  ...ACTIONER_CONFLICT_CODES,
  'upgrade-plan-stale',
  'upgrade-apply-blocked',
  'upgrade-no-branch',
  'upgrade-working-tree-dirty',
  'upgrade-cleanup-unavailable',
  'upgrade-cleanup-blocked',
  'upgrade-merge-unavailable',
  'upgrade-merge-blocked',
  'upgrade-source-changed',
  'upgrade-source-unavailable',
  'upgrade-source-file-unavailable',
  'upgrade-policy-merge-unavailable',
  'bootstrap-plan-stale',
  'bootstrap-apply-blocked',
  'ai-review-acknowledgement-required',
  'ai-review-stale-or-unavailable',
])

// Malformed or unapproved apply requests — the caller sent something that
// cannot be honoured as-is.
const INVALID_REQUEST_CODES = new Set([
  'upgrade-path-not-managed',
  'upgrade-deletion-not-managed',
  'upgrade-deletion-confirmation-required',
  'bootstrap-branch-invalid',
  'bootstrap-policy-invalid',
])

export function statusForError(error: unknown): number {
  if (!(error instanceof AdviserError)) return 500
  if (error.code === 'repository-not-found') return 404
  if (error.code === 'actioner-job-not-found') return 404
  if (error.code === 'bootstrap-job-not-found') return 404
  if (error.code === 'actioner-plan-stale-or-blocked') return 409
  if (error.code === 'settings-request-invalid') return 400
  if (error.code === 'actioner-request-invalid') return 400
  if (
    error.code === 'request-host-rejected'
    || error.code === 'request-origin-rejected'
    || error.code === 'session-token-invalid'
  ) return 403
  if (error.code.startsWith('request-')) return 400
  if (INVALID_REQUEST_CODES.has(error.code)) return 400
  if (CONFLICT_CODES.has(error.code)) return 409
  return 500
}

export function publicMessage(error: unknown, status: number): string {
  if (status >= 500) return 'Repository inspection failed safely.'
  return error instanceof Error ? error.message : 'Request failed.'
}
