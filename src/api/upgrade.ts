import type { AiReviewResult } from '../../shared/ai-review'
import type {
  TctbpApplyMode,
  TctbpApplyResult,
  TctbpApplyStep,
  TctbpUpgradePlan,
} from '../../shared/tctbp-upgrade'
import { requestJson } from './client'

export async function loadTctbpUpgradeReview(
  repositoryId: string,
): Promise<AiReviewResult> {
  return requestJson<AiReviewResult>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/tctbp-upgrade-review`,
    { method: 'POST' },
  )
}

export async function applyTctbpUpgradePlan(
  repositoryId: string,
  planFingerprint: string,
  aiReviewId: string,
  mode: TctbpApplyMode,
  approvedPaths: string[] = [],
  approvedDeletionPaths: string[] = [],
  confirmDeletions = false,
  steps?: TctbpApplyStep[],
): Promise<TctbpApplyResult> {
  return requestJson<TctbpApplyResult>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/tctbp-apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        aiReviewId,
        aiReviewAcknowledged: true,
        planFingerprint,
        mode,
        approvedPaths,
        approvedDeletionPaths,
        confirmDeletions,
        ...(steps && steps.length > 0 ? { steps } : {}),
      }),
    },
  )
}

export async function loadTctbpUpgradePlan(
  repositoryId: string,
): Promise<TctbpUpgradePlan> {
  return requestJson<TctbpUpgradePlan>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/tctbp-upgrade-plan`,
    { method: 'POST' },
  )
}
