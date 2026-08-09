import type { AiReviewResult } from '../shared/ai-review'
import type {
  AppSettingsResponse,
  AppSettingsUpdate,
} from '../shared/app-settings'
import type { ActionerIntent, ActionerJob, ActionerJobStart } from '../shared/actioner'
import type {
  TctbpBootstrapApplyResult,
  TctbpBootstrapJob,
  TctbpBootstrapJobStart,
  TctbpBootstrapPlan,
  TctbpBootstrapRequest,
} from '../shared/tctbp-bootstrap'
import type { PortfolioSnapshot } from '../shared/portfolio'
import type { PortfolioPreferences } from '../shared/portfolio-preferences'
import type { RecommendationIntent } from '../shared/recommendation'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import type { ReferenceCatalogue } from '../shared/reference'
import type {
  TctbpApplyMode,
  TctbpApplyResult,
  TctbpUpgradePlan,
} from '../shared/tctbp-upgrade'

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

export async function startPublishAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'publish',
        intent: 'preserve-and-publish',
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export async function startBranchDevelopmentAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/branch-development`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'branch-development',
        intent: 'deploy-current-environment',
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export async function startResumeAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/resume`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'resume',
        intent: 'resume-after-machine-change',
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export async function startHandoverAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/handover`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'handover',
        intent: 'continue-on-another-machine',
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export async function startRepairCompatibilityAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/repair-tctbp-script-compatibility`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'repair-tctbp-script-compatibility',
        intent: 'deploy-current-environment',
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export async function startDeployDevelopmentAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/deploy-development`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'deploy-development',
        intent: 'deploy-current-environment',
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export async function startPromoteReviewAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/promote-review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'promote-review',
        intent: 'prepare-pre-production',
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export async function startPromoteProductionAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/promote-production`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'promote-production',
        intent: 'prepare-production-release',
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export async function startShipAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/ship`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'ship',
        intent: 'prepare-production-release',
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export async function startCheckpointAction(
  repositoryId: string,
  planFingerprint: string,
  intent: ActionerIntent,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/checkpoint`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: 'checkpoint',
        intent,
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export async function loadActionerJob(
  repositoryId: string,
  jobId: string,
): Promise<ActionerJob> {
  return requestJson<ActionerJob>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/action-jobs/${encodeURIComponent(jobId)}`,
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

export async function loadRepositoryDetail(
  repositoryId: string,
  intent: RecommendationIntent,
): Promise<RepositoryDetailResult> {
  return requestJson<RepositoryDetailResult>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/detail`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent }),
    },
  )
}

export async function loadPortfolio(
  forceRefresh = false,
): Promise<PortfolioSnapshot> {
  return requestJson<PortfolioSnapshot>(
    forceRefresh ? '/api/repositories/refresh' : '/api/portfolio',
    forceRefresh ? { method: 'POST' } : undefined,
  )
}

export async function loadReferenceCatalogue(): Promise<ReferenceCatalogue> {
  return requestJson<ReferenceCatalogue>('/api/catalogue')
}

export async function loadAppSettings(): Promise<AppSettingsResponse> {
  return requestJson<AppSettingsResponse>('/api/settings')
}

export async function saveAppSettings(
  update: AppSettingsUpdate,
): Promise<AppSettingsResponse> {
  return requestJson<AppSettingsResponse>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  })
}

export async function loadServerPortfolioPreferences(): Promise<PortfolioPreferences> {
  return requestJson<PortfolioPreferences>('/api/preferences')
}

export async function saveServerPortfolioPreferences(
  preferences: PortfolioPreferences,
): Promise<void> {
  await requestJson<PortfolioPreferences>('/api/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  })
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
  })
  const body = await response.json() as unknown
  if (!response.ok) {
    throw new Error(apiErrorMessage(body, response.status))
  }
  return body as T
}

function apiErrorMessage(body: unknown, status: number): string {
  if (
    typeof body === 'object'
    && body !== null
    && 'error' in body
    && typeof body.error === 'object'
    && body.error !== null
    && 'message' in body.error
    && typeof body.error.message === 'string'
  ) {
    return body.error.message
  }
  return `The local Adviser service returned HTTP ${status}.`
}
