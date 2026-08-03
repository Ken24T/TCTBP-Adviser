import { describe, expect, it } from 'vitest'
import type { RepositoryObservation } from '../../shared/inspection'
import type { RecommendationIntent } from '../../shared/recommendation'
import { observationFixture } from '../../test/observation-fixture'
import { recommend } from '../recommendations/engine'
import { planIntent } from './planner'

const WORKFLOWS = [
  'status',
  'checkpoint',
  'publish',
  'handover',
  'resume',
  'promote',
  'deploy',
  'ship',
  'abort',
]

describe('intent planner', () => {
  it('keeps the fingerprint stable across inspection timestamps', () => {
    const first = buildPlan('preserve-locally', {
      clean: false,
      observedAt: '2026-08-03T10:00:00.000Z',
    })
    const second = buildPlan('preserve-locally', {
      clean: false,
      observedAt: '2026-08-03T10:01:00.000Z',
    })

    expect(first?.fingerprint).toBe(second?.fingerprint)
  })

  it('preserves dirty work before publishing it', () => {
    const plan = buildPlan('preserve-and-publish', {
      clean: false,
    })

    expect(plan?.status).toBe('ready')
    expect(plan?.steps.map((step) => step.id)).toEqual([
      'status',
      'checkpoint',
      'publish',
    ])
    expect(plan?.likelyNextStepId).toBe('checkpoint')
  })

  it('publishes an ahead clean branch without inventing a checkpoint', () => {
    const plan = buildPlan('preserve-and-publish', {
      syncState: 'ahead',
    })

    expect(plan?.steps.map((step) => step.id)).toEqual([
      'status',
      'publish',
    ])
    expect(plan?.likelyNextStepId).toBe('publish')
  })

  it('recognises work that is already preserved and published', () => {
    const plan = buildPlan('preserve-and-publish')

    expect(plan).toMatchObject({
      status: 'complete',
      likelyNextStepId: null,
    })
  })

  it('prefers handover when continuing on another machine', () => {
    const plan = buildPlan('continue-on-another-machine', {
      clean: false,
    })

    expect(plan?.steps.map((step) => step.workflowId)).toEqual(['handover'])
    expect(plan?.steps[0].trigger).toBe('handover please')
  })

  it('maps a long-lived review branch without relabelling it', () => {
    const observation = fullObservation()
    observation.tctbp.branchModel = {
      strategy: 'long-lived',
      workingBranch: 'development',
      preProductionBranch: 'review',
      productionBranch: 'main',
      promotionTargets: ['review', 'production'],
    }

    const plan = fromObservation(observation, 'prepare-pre-production')

    expect(plan?.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'promote-review',
        trigger: 'promote review please',
        targetBranch: 'review',
      }),
      expect.objectContaining({
        id: 'deploy-review',
        trigger: 'deploy staging please',
        targetBranch: 'review',
      }),
    ]))
  })

  it('shows the staged release sequence from the working branch', () => {
    const plan = buildPlan('prepare-production-release')

    expect(plan?.steps.map((step) => step.id)).toEqual([
      'promote-staging',
      'deploy-staging',
      'promote-production',
      'ship',
      'deploy-production',
    ])
  })

  it('deploys a simple main branch as production', () => {
    const observation = fullObservation()
    observation.head.branch = 'main'
    observation.tctbp.branchModel = {
      strategy: 'simple',
      workingBranch: 'main',
      preProductionBranch: null,
      productionBranch: 'main',
      promotionTargets: [],
    }

    const plan = fromObservation(observation, 'deploy-current-environment')

    expect(plan?.steps).toEqual([
      expect.objectContaining({
        id: 'deploy-production',
        trigger: 'deploy production please',
      }),
    ])
  })

  it('blocks release intent when the branch has diverged', () => {
    const plan = buildPlan('prepare-production-release', {
      syncState: 'diverged',
    })

    expect(plan).toMatchObject({
      status: 'blocked',
      blockedBy: [expect.objectContaining({ code: 'branch-diverged' })],
    })
  })

  it('blocks a plan when its required workflow is not advertised', () => {
    const observation = observationFixture()

    const plan = fromObservation(observation, 'prepare-production-release')

    expect(plan).toMatchObject({
      status: 'blocked',
      blockedBy: expect.arrayContaining([
        expect.objectContaining({ code: 'workflow-unavailable' }),
      ]),
    })
  })

  it('offers inspection-first recovery for an interrupted operation', () => {
    const plan = buildPlan('recover-interrupted-workflow', {
      operations: ['merge'],
    })

    expect(plan?.status).toBe('ready')
    expect(plan?.steps.map((step) => step.id)).toEqual([
      'inspect-recovery',
      'abort',
    ])
    expect(plan?.steps[1].condition).toBe('conditional')
  })
})

function buildPlan(
  intent: Exclude<RecommendationIntent, 'none'>,
  options: Parameters<typeof observationFixture>[0] = {},
) {
  return fromObservation(
    observationFixture({ ...options, workflows: WORKFLOWS }),
    intent,
  )
}

function fullObservation(): RepositoryObservation {
  return observationFixture({ workflows: WORKFLOWS })
}

function fromObservation(
  observation: RepositoryObservation,
  intent: Exclude<RecommendationIntent, 'none'>,
) {
  const state = recommend(
    observation,
    'none',
    new Date(observation.observedAt),
  )
  return planIntent(observation, state, intent)
}
