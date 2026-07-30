import type { RepositorySummary } from '../shared/inspection'
import type { RecommendationIntent } from '../shared/recommendation'
import type { RepositoryDetailResult } from '../shared/repository-detail'

interface RepositoryListResponse {
  repositories: RepositorySummary[]
}

export async function loadRepositoryDetail(
  intent: RecommendationIntent,
): Promise<RepositoryDetailResult> {
  const list = await requestJson<RepositoryListResponse>('/api/repositories')
  const repository = list.repositories[0]
  if (!repository) {
    throw new Error('No local repository is configured for inspection.')
  }

  return requestJson<RepositoryDetailResult>(
    `/api/repositories/${encodeURIComponent(repository.id)}/detail`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent }),
    },
  )
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
