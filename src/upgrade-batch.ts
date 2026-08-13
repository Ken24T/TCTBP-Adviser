// Decides when the "Run all" batch affordance is safe to offer. The manual
// step-by-step journey is always available; the batch is only surfaced when
// every remaining stage is pure execution (no human decision required):
// Jasper's review must already be done and acknowledged, and the plan must be
// unblocked. Pure and unit-testable; no I/O.

import {
  resolveUpgradeJourney,
  type UpgradeJourney,
  type UpgradeJourneyInput,
  type UpgradeJourneyStage,
} from './upgrade-journey'

const EXECUTION_ACTIONS = new Set([
  'apply',
  'checkpoint',
  'publish',
  'merge',
  'cleanup',
])

export interface BatchableJourney {
  safe: boolean
  reason: string | null
  /** The ordered remaining journey stages (execution-only once safe). */
  stages: UpgradeJourneyStage[]
}

/**
 * Returns whether the remaining upgrade journey can be run as one batch.
 * Safe only when every remaining stage is an execution stage — i.e. the human
 * gates (prepare/review/acknowledge) have already been passed — and the plan
 * is not blocked.
 */
export function batchableJourney(
  input: UpgradeJourneyInput,
): BatchableJourney {
  const journey: UpgradeJourney | null = resolveUpgradeJourney(input)
  if (!journey) {
    return { safe: false, reason: null, stages: [] }
  }
  const current = journey.current
  if (!EXECUTION_ACTIONS.has(current.action)) {
    return {
      safe: false,
      reason: 'Jasper review and confirmation must be completed before a batch run.',
      stages: journey.stages,
    }
  }
  if (input.plan && input.plan.blockers.length > 0) {
    return {
      safe: false,
      reason: 'The upgrade plan is blocked — resolve blockers first.',
      stages: journey.stages,
    }
  }
  return { safe: true, reason: null, stages: journey.stages }
}
