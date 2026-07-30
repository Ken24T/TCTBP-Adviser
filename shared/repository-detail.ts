import type { RepositoryObservation } from './inspection'
import type { RecommendationResult } from './recommendation'

export interface RepositoryDetailResult {
  observation: RepositoryObservation
  recommendation: RecommendationResult
}
