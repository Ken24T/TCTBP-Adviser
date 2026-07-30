import type { RecommendationIntent } from '../shared/recommendation'

export const INTENT_OPTIONS: Array<{
  value: RecommendationIntent
  label: string
}> = [
  { value: 'none', label: 'Check repository health' },
  { value: 'preserve-locally', label: 'Preserve work locally' },
  { value: 'preserve-and-publish', label: 'Preserve and publish current work' },
  {
    value: 'continue-on-another-machine',
    label: 'Continue on another machine',
  },
  {
    value: 'resume-after-machine-change',
    label: 'Resume after changing machines',
  },
  { value: 'prepare-pre-production', label: 'Prepare staging or review' },
  { value: 'deploy-current-environment', label: 'Deploy current environment' },
  {
    value: 'prepare-production-release',
    label: 'Prepare a production release',
  },
  {
    value: 'recover-interrupted-workflow',
    label: 'Recover an interrupted workflow',
  },
]

export function intentLabel(intent: RecommendationIntent): string {
  return INTENT_OPTIONS.find((option) => option.value === intent)?.label
    ?? intent
}
