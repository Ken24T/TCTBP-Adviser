import type { AiReviewResult } from '../../shared/ai-review'
import type {
  TctbpBootstrapApplyResult,
  TctbpBootstrapJob,
  TctbpBootstrapJobStart,
  TctbpBootstrapPlan,
  TctbpBootstrapRequest,
} from '../../shared/tctbp-bootstrap'
import { requestJson } from './client'

export async function loadTctbpBootstrapReview(
  repositoryId: string,
  request: TctbpBootstrapRequest,
): Promise<AiReviewResult> {
  return requestJson<AiReviewResult>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/tctbp-bootstrap-review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  )
}

export async function startTctbpBootstrap(
  repositoryId: string,
  planFingerprint: string,
  aiReviewId: string,
  request: TctbpBootstrapRequest,
): Promise<TctbpBootstrapJobStart> {
  return requestJson<TctbpBootstrapJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/tctbp-bootstrap-apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        aiReviewId,
        aiReviewAcknowledged: true,
        planFingerprint,
        request,
      }),
    },
  )
}

export async function loadTctbpBootstrapJob(
  repositoryId: string,
  jobId: string,
): Promise<TctbpBootstrapJob> {
  return requestJson<TctbpBootstrapJob>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/tctbp-bootstrap-jobs/${encodeURIComponent(jobId)}`,
  )
}

export async function applyTctbpBootstrap(
  repositoryId: string,
  planFingerprint: string,
  aiReviewId: string,
  request: TctbpBootstrapRequest,
): Promise<TctbpBootstrapApplyResult> {
  return requestJson<TctbpBootstrapApplyResult>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/tctbp-bootstrap-apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        aiReviewId,
        aiReviewAcknowledged: true,
        planFingerprint,
        request,
      }),
    },
  )
}

export async function prepareTctbpBootstrap(
  repositoryId: string,
  request: TctbpBootstrapRequest,
): Promise<TctbpBootstrapPlan> {
  return requestJson<TctbpBootstrapPlan>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/tctbp-bootstrap-plan`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  )
}
