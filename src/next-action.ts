// Unified "what's next" resolver for the always-visible action bar. The bar
// owns every action surface on the detail page: the upgrade journey takes
// precedence, otherwise the state-driven recommendation is surfaced as either
// a one-click workflow (checkpoint/publish/resume/handover), guidance, or the
// healthy no-op state. Pure and unit-testable; no I/O.

import type { AiReviewResult } from '../shared/ai-review'
import type {
  RecommendationAction,
  RecommendationResult,
} from '../shared/recommendation'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import { actionLabel } from './presentation'
import {
  resolveUpgradeJourney,
  type UpgradeJourney,
} from './upgrade-journey'

export type NextActionKind =
  | 'journey'
  | 'workflow'
  | 'guidance'
  | 'none'

export type RunnableWorkflowId =
  | 'checkpoint'
  | 'publish'
  | 'resume'
  | 'handover'

export interface NextAction {
  kind: NextActionKind
  /** Short eyebrow headline, e.g. "Upgrade journey" or "Recommended: Checkpoint". */
  headline: string
  /** The step label, e.g. "Checkpoint the applied changes". */
  label: string
  reason: string
  /** One-click workflow to run ('workflow' kind). */
  workflow?: RunnableWorkflowId
  /** The resolved upgrade journey ('journey' kind). */
  journey?: UpgradeJourney
  /** Suggested trigger for guidance kinds. */
  trigger?: string | null
}

export interface NextActionInput {
  plan: TctbpUpgradePlan | null
  aiReview: AiReviewResult | null
  aiAcknowledged: boolean
  primaryAction: RecommendationAction | null
  recommendation: RecommendationResult | null
  branchModel?: {
    workingBranch?: string | null
    preProductionBranch?: string | null
    productionBranch?: string | null
  } | null
}

const RUNNABLE_WORKFLOWS: Partial<Record<RecommendationAction, RunnableWorkflowId>> = {
  checkpoint: 'checkpoint',
  publish: 'publish',
  resume: 'resume',
  handover: 'handover',
}

const REASON_HINTS: Partial<Record<RecommendationAction, string>> = {
  checkpoint: 'The working tree has uncommitted work — preserve it locally before anything else.',
  publish: 'Local commits have not been published — back them up on origin.',
  resume: 'Local and origin have diverged — reconcile before continuing.',
  handover: 'The repository is ready for a machine handover.',
  'install-tctbp': 'TCTBP is not installed in this repository yet.',
  'review-compatibility': 'The Adviser contract is incompatible with this repository.',
  'update-tctbp': 'A newer canonical TCTBP infrastructure version is available.',
  'reattach-branch': 'HEAD is detached — reattach to a branch before continuing.',
  'refresh-inspection': 'Fresh repository evidence is required before advising.',
  'abort-dry-run': 'A dry run is in progress — review the abort options.',
  'inspect-recovery': 'The repository needs a safe recovery investigation.',
}

/**
 * Returns the single action the always-visible bar should surface, or the
 * healthy no-op state. Never returns null — the bar stays put so the action
 * surface is stable instead of appearing and disappearing.
 */
export function resolveNextAction(input: NextActionInput): NextAction {
  const { plan, aiReview, aiAcknowledged, primaryAction, recommendation, branchModel } = input

  // 1. The upgrade journey owns the bar while it is in play.
  const journey = resolveUpgradeJourney({
    plan,
    aiReview,
    aiAcknowledged,
    primaryAction,
    branchModel,
  })
  if (journey) {
    return {
      kind: 'journey',
      headline: 'Upgrade journey',
      label: journey.current.label,
      reason: journey.current.reason,
      journey,
    }
  }

  // 2. Runnable recommended workflows get a one-click button.
  if (primaryAction) {
    const workflow = RUNNABLE_WORKFLOWS[primaryAction]
    if (workflow) {
      return {
        kind: 'workflow',
        headline: `Recommended: ${actionLabel(primaryAction)}`,
        label: actionLabel(primaryAction),
        reason: REASON_HINTS[primaryAction]
          ?? (recommendation?.reasonCodes[0]
            ? `${recommendation.reasonCodes[0]}.`
            : 'The repository needs attention.'),
        workflow,
        trigger: recommendation?.trigger,
      }
    }
    // 3. Everything else is guidance: visible, but no one-click button.
    return {
      kind: 'guidance',
      headline: `Recommended: ${actionLabel(primaryAction)}`,
      label: actionLabel(primaryAction),
      reason: REASON_HINTS[primaryAction]
        ?? (recommendation?.reasonCodes[0]
          ? `${recommendation.reasonCodes[0]}.`
          : 'The repository needs attention.'),
      trigger: recommendation?.trigger,
    }
  }

  // 4. Healthy — keep the bar visible but quiet.
  return {
    kind: 'none',
    headline: 'All up to date',
    label: 'No action needed',
    reason: 'The repository is healthy and in sync.',
    trigger: recommendation?.trigger,
  }
}
