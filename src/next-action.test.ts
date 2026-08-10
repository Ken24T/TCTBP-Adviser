import { describe, expect, it } from 'vitest'
import type { AiReviewResult } from '../shared/ai-review'
import type { RecommendationAction } from '../shared/recommendation'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import { resolveNextAction } from './next-action'

const REVISION = 'a'.repeat(40)

const review: AiReviewResult = {
  status: 'available',
  reviewId: 'review-1',
  reviewedAt: new Date().toISOString(),
  provider: 'openai-compatible',
  model: 'test-model',
  planFingerprint: 'fp',
  summary: 'No blockers.',
  risks: [],
  recommendedNextStep: 'Apply.',
  confidence: 'high',
  unknowns: [],
  error: null,
}

function plan(overrides: Partial<TctbpUpgradePlan> = {}): TctbpUpgradePlan {
  return {
    fingerprint: 'fp',
    disposition: 'review-required',
    sourceAlignment: 'outdated',
    actionCounts: { preserve: 1, add: 0, review: 1, unavailable: 0 },
    blockers: [],
    policy: { state: 'drifted', differences: [] },
    source: {
      state: 'available',
      repository: 'TCTBP-Web',
      revision: REVISION,
      version: '0.3.0',
      managedFileCount: 2,
      message: null,
    },
    target: {
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'b'.repeat(40),
      sourceVersion: '0.2.0',
    },
    drift: {
      files: [
        {
          path: 'scripts/tctbp-core.js',
          state: 'drifted',
          action: 'review',
          sourceHash: 's',
          targetHash: 't',
        },
      ],
      counts: { current: 1, 'missing-target': 0, drifted: 1, 'source-unavailable': 0 },
    },
    ...overrides,
  }
}

function resolve(overrides: {
  plan?: TctbpUpgradePlan | null
  aiReview?: AiReviewResult | null
  aiAcknowledged?: boolean
  primaryAction?: RecommendationAction | null
}) {
  return resolveNextAction({
    plan: overrides.plan === undefined ? plan() : overrides.plan,
    aiReview: overrides.aiReview === undefined ? null : overrides.aiReview,
    aiAcknowledged: overrides.aiAcknowledged ?? false,
    primaryAction: overrides.primaryAction === undefined ? 'update-tctbp' : overrides.primaryAction,
    recommendation: null,
  })
}

describe('unified next action', () => {
  it('lets the upgrade journey own the bar while it is in play', () => {
    const action = resolve({})
    expect(action.kind).toBe('journey')
    expect(action.headline).toBe('Upgrade journey')
    expect(action.journey?.current.id).toBe('review')
  })

  it('surfaces a runnable recommended workflow with a button', () => {
    const action = resolve({ plan: null, primaryAction: 'publish' })
    expect(action).toMatchObject({
      kind: 'workflow',
      headline: 'Recommended: Publish',
      workflow: 'publish',
    })
  })

  it('keeps the bar visible as guidance for non-runnable recommendations', () => {
    const action = resolve({ plan: null, primaryAction: 'install-tctbp' })
    expect(action).toMatchObject({
      kind: 'guidance',
      headline: 'Recommended: Install TCTBP',
    })
    expect(action.reason).toContain('TCTBP is not installed')
  })

  it('keeps the bar visible but quiet when healthy', () => {
    const action = resolve({ plan: null, primaryAction: null })
    expect(action).toMatchObject({
      kind: 'none',
      headline: 'All up to date',
      label: 'No action needed',
    })
  })

  it('always returns an action so the bar never disappears', () => {
    expect(resolve({ plan: null, primaryAction: null })).toBeTruthy()
    expect(resolve({})).toBeTruthy()
  })

  it('shows the checkpoint workflow when the tree is dirty with no upgrade in play', () => {
    const action = resolve({ plan: null, primaryAction: 'checkpoint' })
    expect(action).toMatchObject({ kind: 'workflow', workflow: 'checkpoint' })
    expect(action.reason).toContain('uncommitted work')
  })

  it('still prioritizes the journey over a checkpoint recommendation', () => {
    const action = resolve({
      plan: plan(),
      aiReview: { ...review, planFingerprint: 'fp' },
      aiAcknowledged: true,
      primaryAction: 'checkpoint',
    })
    expect(action.kind).toBe('journey')
    expect(action.journey?.current.id).toBe('apply')
  })
})
