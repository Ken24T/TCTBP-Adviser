import type { PortfolioSnapshot } from '../../shared/portfolio'
import type { PortfolioPreferences } from '../../shared/portfolio-preferences'
import type { RecommendationIntent } from '../../shared/recommendation'
import type { RepositoryDetailResult } from '../../shared/repository-detail'
import { requestJson } from './client'

export async function loadPortfolio(
  forceRefresh = false,
): Promise<PortfolioSnapshot> {
  return requestJson<PortfolioSnapshot>(
    forceRefresh ? '/api/repositories/refresh' : '/api/portfolio',
    forceRefresh ? { method: 'POST' } : undefined,
  )
}

export async function refreshRepositoryOnServer(
  repositoryId: string,
): Promise<PortfolioSnapshot> {
  return requestJson<PortfolioSnapshot>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/refresh`,
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
