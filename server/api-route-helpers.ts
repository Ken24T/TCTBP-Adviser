import type { ActionerResult } from '../shared/actioner'
import type { ActionerJobStore } from './actioner-jobs'
import type { AiReviewStore } from './ai-review-store'
import { AdviserError } from './errors'
import type { PortfolioService } from './portfolio'

export function safeActionerJobError(error: unknown): string {
  if (error instanceof AdviserError) return `${error.code}: ${error.message}`
  const value = error as { message?: unknown; stderr?: unknown }
  const message = typeof value.message === 'string' ? value.message : 'Actioner workflow failed before completion.'
  const stderr = typeof value.stderr === 'string' ? value.stderr.trim() : ''
  const detail = sanitiseActionerDetail(stderr || message)
  return detail.length > 0 ? `Actioner workflow failed: ${detail.slice(0, 800)}` : 'Actioner workflow failed before completion.'
}

function sanitiseActionerDetail(value: string): string {
  return value
    .replace(/https?:\/\/[^\s]+/gi, '[remote-url]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/token[=:]\s*[^\s]+/gi, 'token=[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Completes a workflow action job and refreshes only the mutated repository
 * into the cached portfolio snapshot, so the dashboard reflects the change
 * without a full re-inspection (tone responsiveness). Falls back to a full
 * cache drop if the targeted refresh cannot run.
 */
export function completeActionJob(
  jobs: ActionerJobStore,
  portfolio: PortfolioService,
  jobId: string,
  result: ActionerResult,
): void {
  const job = jobs.complete(jobId, result)
  void portfolio.refreshAfterMutation(job.repositoryId)
}

export function safeBootstrapJobError(error: unknown): string {
  if (error instanceof AdviserError) return `${error.code}: ${error.message}`
  return 'Bootstrap failed before completion.'
}

export function requireAiApproval(
  store: AiReviewStore,
  reviewId: string,
  acknowledged: boolean,
  currentPlanFingerprint: string | undefined,
): void {
  if (!acknowledged) {
    throw new AdviserError(
      'ai-review-acknowledgement-required',
      'A successful Jasper review must be acknowledged before applying changes.',
    )
  }
  const review = store.get(reviewId)
  if (
    !review
    || review.status !== 'available'
    || review.planFingerprint !== currentPlanFingerprint
  ) {
    throw new AdviserError(
      'ai-review-stale-or-unavailable',
      'The Jasper review is missing, unavailable, or no longer matches the current plan.',
    )
  }
}
