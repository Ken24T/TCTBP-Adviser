import type {
  ActionerIntent,
  ActionerJobStart,
  ActionerWorkflowId,
} from '../shared/actioner'
import type { RecommendationAction } from '../shared/recommendation'
import type { BranchModelObservation } from '../shared/inspection'
import {
  startBranchDevelopmentAction,
  startCheckpointAction,
  startDeployDevelopmentAction,
  startHandoverAction,
  startPromoteProductionAction,
  startPromoteReviewAction,
  startPublishAction,
  startRepairCompatibilityAction,
  startResumeAction,
  startShipAction,
} from './api'

/** User-facing confirmation prompts for each workflow action. */
export const ACTION_CONFIRMATIONS: Record<ActionerWorkflowId, string> = {
  checkpoint: 'Create a local checkpoint commit? No push, branch switch, merge, or deployment will occur.',
  publish: 'Publish the current branch to origin? No merge, tag, deploy, or release will occur.',
  'branch-development': 'Create and switch to the configured development branch? No publish or deployment will occur.',
  'repair-tctbp-script-compatibility': 'Add scripts/package.json to scope TCTBP CommonJS scripts without committing or publishing.',
  handover: 'Create continuation context and publish the current branch for another machine.',
  resume: 'Reconcile the clean local branch with its origin state. No force update will occur.',
  'promote-review': 'Promote the current development branch into review? This will merge, verify, and publish review. No deployment will occur.',
  'promote-production': 'Promote the current review branch into main? This will merge, verify, and prepare main for ship. No deploy or push will occur.',
  ship: 'Ship a release from main? This will bump the version, create a tag, and push to origin.',
  'deploy-development': 'Deploy the development branch to the configured development environment? No merge or production action will occur.',
}

/**
 * Resolves a branch-aware confirmation prompt for promote/ship actions,
 * falling back to the static prompt when no branch model is available. The
 * production branch is not always named 'main' (e.g. audio-extractor uses
 * 'master'), so hardcoded prompts would be misleading.
 */
export function actionConfirmation(
  workflowId: ActionerWorkflowId,
  branchModel: BranchModelObservation | null,
): string {
  if (workflowId === 'promote-review' && branchModel) {
    const source = branchModel.workingBranch ?? 'development'
    const target = branchModel.preProductionBranch ?? 'review'
    return `Promote the current ${source} branch into ${target}? This will merge, verify, and publish ${target}. No deployment will occur.`
  }
  if (workflowId === 'promote-production' && branchModel) {
    const source = branchModel.preProductionBranch ?? 'review'
    const target = branchModel.productionBranch ?? 'main'
    return `Promote the current ${source} branch into ${target}? This will merge, verify, and prepare ${target} for ship. No deploy or push will occur.`
  }
  if (workflowId === 'ship' && branchModel) {
    const target = branchModel.productionBranch ?? 'main'
    return `Ship a release from ${target}? This will bump the version, create a tag, and push to origin.`
  }
  return ACTION_CONFIRMATIONS[workflowId]
}

/** Maps a state-driven recommendation to the workflow that implements it. */
export function workflowForRecommendation(
  action: RecommendationAction | null,
): ActionerWorkflowId | null {
  if (action === 'checkpoint') return 'checkpoint'
  if (action === 'publish') return 'publish'
  if (action === 'resume') return 'resume'
  if (action === 'handover') return 'handover'
  return null
}

/** Starts a workflow action against the selected repository. */
export async function startWorkflowAction(
  workflowId: ActionerWorkflowId,
  repositoryId: string,
  fingerprint: string,
  intent: ActionerIntent,
): Promise<ActionerJobStart> {
  switch (workflowId) {
    case 'checkpoint':
      return startCheckpointAction(repositoryId, fingerprint, intent)
    case 'publish':
      return startPublishAction(repositoryId, fingerprint, intent)
    case 'branch-development':
      return startBranchDevelopmentAction(repositoryId, fingerprint)
    case 'repair-tctbp-script-compatibility':
      return startRepairCompatibilityAction(repositoryId, fingerprint)
    case 'handover':
      return startHandoverAction(repositoryId, fingerprint)
    case 'resume':
      return startResumeAction(repositoryId, fingerprint)
    case 'promote-review':
      return startPromoteReviewAction(repositoryId, fingerprint)
    case 'promote-production':
      return startPromoteProductionAction(repositoryId, fingerprint)
    case 'ship':
      return startShipAction(repositoryId, fingerprint)
    case 'deploy-development':
      return startDeployDevelopmentAction(repositoryId, fingerprint)
  }
}
