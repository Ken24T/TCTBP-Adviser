// Resolves the single "what's next" step for the TCTBP upgrade journey, so
// the whole flow can be driven from one sticky strip instead of scattered
// buttons across the detail page. Pure and unit-testable; no I/O.

import type { AiReviewResult } from '../shared/ai-review'
import type { RecommendationAction } from '../shared/recommendation'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'

export type UpgradeJourneyStageId =
  | 'prepare'
  | 'review'
  | 'acknowledge'
  | 'apply'
  | 'checkpoint'
  | 'publish'
  | 'merge'
  | 'cleanup'

export type UpgradeJourneyAction =
  | 'prepare'
  | 'review'
  | 'acknowledge'
  | 'apply'
  | 'checkpoint'
  | 'publish'
  | 'merge'
  | 'cleanup'
  | 'none'

export interface UpgradeJourneyStage {
  id: UpgradeJourneyStageId
  label: string
  reason: string
  action: UpgradeJourneyAction
}

export interface UpgradeJourney {
  /** Ordered pending stages; the first is the one to act on now. */
  stages: UpgradeJourneyStage[]
  /** The single current step — always stages[0]. */
  current: UpgradeJourneyStage
}

export interface UpgradeJourneyInput {
  plan: TctbpUpgradePlan | null
  aiReview: AiReviewResult | null
  aiAcknowledged: boolean
  primaryAction: RecommendationAction | null
  /** Branch model used to name the environment branch in merge guidance. */
  branchModel?: {
    workingBranch?: string | null
    preProductionBranch?: string | null
    productionBranch?: string | null
  } | null
}

/** Mirrors the upgrade panel's "applicable step count" for the apply stage. */
export function applicableUpgradeStepCount(plan: TctbpUpgradePlan): number {
  const alignmentPending = Boolean(
    plan.sourceAlignment !== 'current'
    && plan.actionCounts.add === 0
    && plan.actionCounts.review === 0
    && plan.policy.state === 'aligned'
    && (plan.drift.obsoleteTargets?.length ?? 0) === 0
  )
  return [
    plan.policy.state === 'drifted',
    plan.actionCounts.add > 0,
    plan.actionCounts.review > 0,
    (plan.drift.obsoleteTargets?.length ?? 0) > 0,
    alignmentPending,
  ].filter(Boolean).length
}

/**
 * Returns the ordered upgrade journey stages that still need attention, or
 * null when no upgrade work is in play (the strip hides entirely).
 */
export function resolveUpgradeJourney(
  input: UpgradeJourneyInput,
): UpgradeJourney | null {
  const { plan, aiReview, aiAcknowledged, primaryAction, branchModel } = input

  // The upgrade journey is relevant when the source is outdated, an upgrade
  // branch is in play (post-apply housekeeping), or the card recommends one.
  const upgradeRelevant = plan
    ? plan.disposition === 'review-required' || Boolean(plan.cleanup?.branch)
    : primaryAction === 'update-tctbp'
  if (!upgradeRelevant) return null

  const stages: UpgradeJourneyStage[] = []

  if (!plan) {
    stages.push({
      id: 'prepare',
      label: 'Prepare the upgrade plan',
      reason: 'Preview what canonical TCTBP files need to change, then review with Jasper before applying.',
      action: 'prepare',
    })
  } else {
    const reviewReady = (
      aiReview?.status === 'available'
      && aiReview.planFingerprint === plan.fingerprint
    )
    // The review/acknowledge/apply chain only matters when there is actual
    // apply work. A repo can be 'review-required' purely because a safety
    // blocker is present (e.g. a dirty working tree after an apply) with
    // nothing left to apply — in that case the journey should proceed
    // straight to post-apply housekeeping.
    const applyWorkPending = applicableUpgradeStepCount(plan) > 0

    if (plan.disposition === 'review-required' && applyWorkPending) {
      if (!reviewReady) {
        stages.push({
          id: 'review',
          label: 'Review the plan with Jasper',
          reason: 'Jasper checks the upgrade for blockers and policy gaps before anything is applied.',
          action: 'review',
        })
      } else if (!aiAcknowledged) {
        stages.push({
          id: 'acknowledge',
          label: 'Confirm Jasper’s review',
          reason: 'Read Jasper’s advisory and confirm it to enable applying the upgrade.',
          action: 'acknowledge',
        })
      } else if (applicableUpgradeStepCount(plan) > 0) {
        const count = applicableUpgradeStepCount(plan)
        stages.push({
          id: 'apply',
          label: `Apply the upgrade (${count} step${count === 1 ? '' : 's'})`,
          reason: plan.target.upgradeBranch
            ? `Applies on a dedicated branch (${plan.target.upgradeBranch}); nothing is committed or pushed.`
            : 'Writes managed files only; nothing is committed or pushed.',
          action: 'apply',
        })
      }
    }

    // Post-apply housekeeping, only while an upgrade branch is in play.
    if (plan.cleanup?.branch) {
      if (primaryAction === 'checkpoint') {
        stages.push({
          id: 'checkpoint',
          label: 'Checkpoint the applied changes',
          reason: 'The upgrade changed the working tree — preserve it as a local commit before publishing.',
          action: 'checkpoint',
        })
      } else if (primaryAction === 'publish') {
        stages.push({
          id: 'publish',
          label: 'Publish the upgrade branch',
          reason: `Push ${plan.cleanup.branch} to origin so the upgrade is backed up.`,
          action: 'publish',
        })
      } else if (!plan.cleanup.available) {
        // The merge lands on the deepest environment branch the upgrade
        // branch descends from — for long-lived repos that is the working
        // branch (development), for simple models the production branch.
        const environmentBranch = branchModel?.workingBranch
          ?? branchModel?.productionBranch
          ?? 'the environment branch'
        stages.push({
          id: 'merge',
          label: 'Merge the upgrade branch back',
          reason: `Merge ${plan.cleanup.branch} back into ${environmentBranch} and push it to origin.`,
          action: 'merge',
        })
      } else {
        stages.push({
          id: 'cleanup',
          label: 'Remove the merged upgrade branch',
          reason: `${plan.cleanup.branch} is fully merged — deleting it locally and on origin loses nothing.`,
          action: 'cleanup',
        })
      }
    }
  }

  const current = stages[0]
  if (!current) return null
  return { stages, current }
}
