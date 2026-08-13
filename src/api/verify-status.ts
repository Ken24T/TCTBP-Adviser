import type { StatusVerifyResult } from '../../shared/status-verify'
import { requestJson } from './client'

/**
 * Runs the repository's own canonical TCTBP status runner (read-only) and
 * returns the verification result.
 */
export async function verifyRepositoryStatus(
  repositoryId: string,
): Promise<StatusVerifyResult> {
  return requestJson<StatusVerifyResult>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/verify-status`,
    { method: 'POST' },
  )
}
