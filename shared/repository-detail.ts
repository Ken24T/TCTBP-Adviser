import type { RepositoryObservation } from './inspection'
import type { RepositoryGitHubEvidence } from './github'
import type { RecommendationResult } from './recommendation'

export interface RepositoryDetailResult {
  observation: RepositoryObservation
  recommendation: RecommendationResult
  github: RepositoryGitHubEvidence
}
