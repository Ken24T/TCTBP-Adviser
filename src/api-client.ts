import type { PortfolioSnapshot } from '../shared/portfolio'
import type { RecommendationIntent } from '../shared/recommendation'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import type { ReferenceCatalogue } from '../shared/reference'

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
