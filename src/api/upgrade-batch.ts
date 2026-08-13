import type {
  UpgradeBatchRequest,
  UpgradeBatchRun,
} from '../../shared/upgrade-batch'
import { requestJson } from './client'

/** Starts a batch run of the reviewed upgrade journey. */
export async function startUpgradeBatch(
  repositoryId: string,
  request: UpgradeBatchRequest,
): Promise<{ runId: string; status: string }> {
  return requestJson<{ runId: string; status: string }>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/upgrade-batch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  )
}

/** Polls a batch run's stage-by-stage state. */
export async function loadUpgradeBatch(
  repositoryId: string,
  runId: string,
): Promise<UpgradeBatchRun> {
  return requestJson<UpgradeBatchRun>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/upgrade-batch/${encodeURIComponent(runId)}`,
  )
}
