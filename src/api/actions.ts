import type {
  ActionerIntent,
  ActionerJob,
  ActionerJobStart,
  ActionerWorkflowId,
} from '../../shared/actioner'
import { requestJson } from './client'

/** Starts a workflow action on the server for the given repository. */
function startAction(
  repositoryId: string,
  workflowId: ActionerWorkflowId,
  intent: ActionerIntent,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return requestJson<ActionerJobStart>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/actions/${workflowId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId,
        intent,
        planFingerprint,
        confirm: true,
      }),
    },
  )
}

export function startPublishAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return startAction(repositoryId, 'publish', 'preserve-and-publish', planFingerprint)
}

export function startBranchDevelopmentAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return startAction(repositoryId, 'branch-development', 'deploy-current-environment', planFingerprint)
}

export function startResumeAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return startAction(repositoryId, 'resume', 'resume-after-machine-change', planFingerprint)
}

export function startHandoverAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return startAction(repositoryId, 'handover', 'continue-on-another-machine', planFingerprint)
}

export function startRepairCompatibilityAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return startAction(repositoryId, 'repair-tctbp-script-compatibility', 'deploy-current-environment', planFingerprint)
}

export function startDeployDevelopmentAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return startAction(repositoryId, 'deploy-development', 'deploy-current-environment', planFingerprint)
}

export function startPromoteReviewAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return startAction(repositoryId, 'promote-review', 'prepare-pre-production', planFingerprint)
}

export function startPromoteProductionAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return startAction(repositoryId, 'promote-production', 'prepare-production-release', planFingerprint)
}

export function startShipAction(
  repositoryId: string,
  planFingerprint: string,
): Promise<ActionerJobStart> {
  return startAction(repositoryId, 'ship', 'prepare-production-release', planFingerprint)
}

export function startCheckpointAction(
  repositoryId: string,
  planFingerprint: string,
  intent: ActionerIntent,
): Promise<ActionerJobStart> {
  return startAction(repositoryId, 'checkpoint', intent, planFingerprint)
}

export async function loadActionerJob(
  repositoryId: string,
  jobId: string,
): Promise<ActionerJob> {
  return requestJson<ActionerJob>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/action-jobs/${encodeURIComponent(jobId)}`,
  )
}
