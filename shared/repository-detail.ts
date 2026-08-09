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
  /** The on-disk folder name of the repository (header fallback title). */
  directoryName: string
}
