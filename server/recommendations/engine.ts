import type { RepositoryObservation } from '../../shared/inspection'
import type {
  RecommendationAction,
  RecommendationIntent,
  RecommendationResult,
} from '../../shared/recommendation'
import {
  effectsFor,
  stepFor,
  triggerFor,
} from './catalogue'
import {
  resolveDefinition,
  type EvaluationContext,
  type ResultDefinition,
  type UpgradeSummaryLike,
} from './rules'

const DEFAULT_MAX_AGE_MS = 30_000

export function recommend(
  observation: RepositoryObservation,
  intent: RecommendationIntent,
  evaluatedAt: Date,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  upgrade: UpgradeSummaryLike | null = null,
): RecommendationResult {
  const observedTime = Date.parse(observation.observedAt)
  const ageMs = Number.isFinite(observedTime)
    ? evaluatedAt.getTime() - observedTime
    : null
  const context: EvaluationContext = {
    observation,
    intent,
    evaluatedAt,
    maxAgeMs,
    ageMs,
    stale: ageMs === null || ageMs < 0 || ageMs > maxAgeMs,
    upgrade,
  }

  return finalise(context, resolveDefinition(context))
}

function finalise(
  context: EvaluationContext,
  definition: ResultDefinition,
): RecommendationResult {
  const actions = definition.actions ?? (
    definition.primaryAction ? [definition.primaryAction] : []
  )
  const uncertainties = [
    ...context.observation.errors,
    ...(definition.uncertainties ?? []),
  ]
  return {
    disposition: definition.disposition,
    primaryAction: definition.primaryAction,
    trigger: triggerFor(definition.primaryAction),
    reasonCodes: definition.reasonCodes,
    severity: definition.severity,
    confidence: 'deterministic',
    intent: context.intent,
    steps: actions.map(stepFor),
    requiredBefore: definition.requiredBefore ?? [],
    blockedActions: definition.blockedActions ?? [],
    likelyNextActions: definition.likelyNextActions ?? [],
    evidence: definition.evidence,
    uncertainties,
    policySource: {
      engine: 'tctbp-adviser/recommendation-v1',
      tctbpSchemaVersion: context.observation.tctbp.schemaVersion,
      contractMajor: context.observation.tctbp.contract.major,
      capabilities: [...context.observation.tctbp.contract.capabilities],
    },
    observationIds: [
      `local:${context.observation.repository.id}:${context.observation.observedAt}`,
    ],
    freshness: {
      observedAt: context.observation.observedAt,
      evaluatedAt: context.evaluatedAt.toISOString(),
      ageMs: context.ageMs,
      stale: context.stale,
      basis: context.observation.basis,
    },
    effects: effectsFor(actions),
  }
}
