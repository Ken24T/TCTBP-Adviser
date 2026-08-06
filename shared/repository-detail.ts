import type { RepositoryObservation } from './inspection'
import type { RepositoryGitHubEvidence } from './github'
import type { IntentPlan } from './intent'
import type { RepositoryReference } from './reference'
import type { RecommendationResult } from './recommendation'

export interface RepositoryDetailResult {
  observation: RepositoryObservation
  recommendation: RecommendationResult
  intentPlan: IntentPlan | null
  reference: RepositoryReference
  github: RepositoryGitHubEvidence
}
