import type {
  RecommendationAction,
  RecommendationIntent,
} from '../shared/recommendation'

export function intentForRecommendation(
  action: RecommendationAction | null,
): RecommendationIntent | null {
  if (action === 'checkpoint') return 'preserve-locally'
  if (action === 'publish') return 'preserve-and-publish'
  if (action === 'resume') return 'resume-after-machine-change'
  if (action === 'handover') return 'continue-on-another-machine'
  return null
}

export function intentLabel(intent: RecommendationIntent): string {
  if (intent === 'preserve-locally') return 'Preserve current work locally'
  if (intent === 'preserve-and-publish') return 'Preserve and publish current work'
  if (intent === 'resume-after-machine-change') return 'Resume after changing machines'
  if (intent === 'continue-on-another-machine') return 'Continue on another machine'
  if (intent === 'deploy-current-environment') return 'Deploy current environment'
  if (intent === 'prepare-production-release') return 'Prepare a production release'
  return intent
}
