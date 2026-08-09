import { describe, expect, it } from 'vitest'
import { observationFixture } from '../test/observation-fixture'
import type { RepositoryObservation } from '../shared/inspection'
import { AdviserError } from './errors'
import { planIntent } from './intents/planner'
import { assertPublishPlan } from './plan-assertions'
import { recommend } from './recommendations/engine'

function productionObservation(): RepositoryObservation {
  const base = observationFixture({
    syncState: 'ahead',
    observedAt: new Date().toISOString(),
    workflows: [
      'status',
      'checkpoint',
      'publish',
      'handover',
      'resume',
      'promote',
      'deploy',
      'ship',
      'abort',
    ],
  })
  return {
    ...base,
    head: { ...base.head, branch: 'main' },
  }
}

function publishPlan(
  observation: RepositoryObservation,
  intent: 'preserve-and-publish' | 'prepare-production-release',
) {
  return planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    intent,
  )
}

describe('publish plan assertion', () => {
  it('accepts a matching preserve-and-publish plan', () => {
    const observation = observationFixture({
      syncState: 'ahead',
      observedAt: new Date().toISOString(),
    })
    const plan = publishPlan(observation, 'preserve-and-publish')

    expect(plan?.status).toBe('ready')
    expect(plan?.steps.find((step) => step.workflowId === 'publish')?.condition)
      .toBe('required')
    expect(() => assertPublishPlan(
      observation,
      plan!.fingerprint,
      'preserve-and-publish',
    )).not.toThrow()
  })

  it('accepts a matching production-release plan on the production branch', () => {
    // Regression: the intent-plan Publish button sends the production-release
    // plan's fingerprint, but assertPublishPlan rebuilt a hardcoded
    // preserve-and-publish plan, so the fingerprints never matched and the
    // action was always rejected as stale.
    const observation = productionObservation()
    const plan = publishPlan(observation, 'prepare-production-release')

    expect(plan?.status).toBe('ready')
    expect(plan?.steps.find((step) => step.workflowId === 'publish')?.condition)
      .toBe('required')
    expect(() => assertPublishPlan(
      observation,
      plan!.fingerprint,
      'prepare-production-release',
    )).not.toThrow()
  })

  it('rejects a stale fingerprint', () => {
    const observation = observationFixture({
      syncState: 'ahead',
      observedAt: new Date().toISOString(),
    })
    const plan = publishPlan(observation, 'preserve-and-publish')

    expect(() => assertPublishPlan(
      observation,
      'a'.repeat(64),
      'preserve-and-publish',
    )).toThrow(AdviserError)
  })

  it('rejects an intent whose plan no longer requires publish', () => {
    const observation = observationFixture({
      syncState: 'in-sync',
      observedAt: new Date().toISOString(),
    })
    const plan = publishPlan(observation, 'preserve-and-publish')

    expect(plan?.status).toBe('complete')
    expect(() => assertPublishPlan(
      observation,
      plan!.fingerprint,
      'preserve-and-publish',
    )).toThrow(AdviserError)
  })
})
