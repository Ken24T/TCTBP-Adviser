import { describe, expect, it } from 'vitest'
import type { AiReviewResult } from '../shared/ai-review'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import {
  applicableUpgradeStepCount,
  resolveUpgradeJourney,
} from './upgrade-journey'

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
  recommendedNextStep: 'Apply after review.',
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

function journeyFor(overrides: {
  plan?: TctbpUpgradePlan | null
  aiReview?: AiReviewResult | null
  aiAcknowledged?: boolean
  primaryAction?: import('../shared/recommendation').RecommendationAction | null
}) {
  return resolveUpgradeJourney({
    plan: overrides.plan === undefined ? plan() : overrides.plan,
    aiReview: overrides.aiReview === undefined ? null : overrides.aiReview,
    aiAcknowledged: overrides.aiAcknowledged ?? false,
    primaryAction: overrides.primaryAction ?? 'update-tctbp',
  })
}

describe('TCTBP upgrade journey', () => {
  it('starts at prepare when the card recommends an update but no plan is loaded', () => {
    const journey = journeyFor({ plan: null, primaryAction: 'update-tctbp' })
    expect(journey?.current).toMatchObject({
      id: 'prepare',
      action: 'prepare',
    })
    expect(journey?.stages.map((stage) => stage.id)).toEqual(['prepare'])
  })

  it('hides when the recommendation is not an upgrade', () => {
    expect(journeyFor({ plan: null, primaryAction: 'checkpoint' })).toBeNull()
  })

  it('asks for a Jasper review before anything else', () => {
    const journey = journeyFor({})
    expect(journey?.current).toMatchObject({ id: 'review', action: 'review' })
  })

  it('asks to confirm the review before enabling apply', () => {
    const journey = journeyFor({
      aiReview: { ...review, planFingerprint: 'fp' },
      aiAcknowledged: false,
    })
    expect(journey?.current).toMatchObject({ id: 'acknowledge', action: 'acknowledge' })
  })

  it('moves to apply once reviewed and acknowledged', () => {
    const journey = journeyFor({
      aiReview: { ...review, planFingerprint: 'fp' },
      aiAcknowledged: true,
    })
    expect(journey?.current).toMatchObject({
      id: 'apply',
      action: 'apply',
      label: 'Apply the upgrade (2 steps)',
    })
  })

  it('describes the dedicated upgrade branch in the apply step', () => {
    const journey = journeyFor({
      aiReview: { ...review, planFingerprint: 'fp' },
      aiAcknowledged: true,
      plan: plan({
        target: {
          sourceRepository: 'Ken24T/TCTBP-Web',
          sourceRevision: 'b'.repeat(40),
          sourceVersion: '0.2.0',
          branch: 'main',
          upgradeBranch: 'upgrade/tctbp-0.3.0-aaaaaaa',
        },
      }),
    })
    expect(journey?.current.reason).toContain('upgrade/tctbp-0.3.0-aaaaaaa')
  })

  it('hides when the plan is current with no upgrade branch in play', () => {
    const current = plan({
      disposition: 'current',
      sourceAlignment: 'current',
      actionCounts: { preserve: 2, add: 0, review: 0, unavailable: 0 },
      policy: { state: 'aligned', differences: [] },
      drift: {
        files: [],
        counts: { current: 2, 'missing-target': 0, drifted: 0, 'source-unavailable': 0 },
      },
    })
    expect(journeyFor({ plan: current, primaryAction: null })).toBeNull()
  })

  it('walks checkpoint → publish → merge → cleanup after an apply', () => {
    const base = plan({
      disposition: 'current',
      sourceAlignment: 'current',
      actionCounts: { preserve: 2, add: 0, review: 0, unavailable: 0 },
      policy: { state: 'aligned', differences: [] },
      drift: {
        files: [],
        counts: { current: 2, 'missing-target': 0, drifted: 0, 'source-unavailable': 0 },
      },
      target: {
        sourceRepository: 'Ken24T/TCTBP-Web',
        sourceRevision: REVISION,
        sourceVersion: '0.3.0',
        branch: 'main',
        upgradeBranch: 'upgrade/tctbp-0.3.0-aaaaaaa',
      },
    })
    const cleanup = (overrides: Record<string, unknown>) => ({
      branch: 'upgrade/tctbp-0.3.0-aaaaaaa',
      available: false,
      reason: null,
      ...overrides,
    })

    // Checkpoint first (dirty tree).
    expect(journeyFor({
      plan: { ...base, cleanup: cleanup({}) },
      aiReview: null,
      aiAcknowledged: false,
      primaryAction: 'checkpoint',
    })?.current.id).toBe('checkpoint')

    // Then publish.
    expect(journeyFor({
      plan: { ...base, cleanup: cleanup({}) },
      aiReview: null,
      aiAcknowledged: false,
      primaryAction: 'publish',
    })?.current.id).toBe('publish')

    // Then merge (branch not merged yet).
    expect(journeyFor({
      plan: { ...base, cleanup: cleanup({ reason: 'upgrade/tctbp-0.3.0-aaaaaaa has not been merged back into main yet — merge and push it first, then it can be removed safely.' }) },
      aiReview: null,
      aiAcknowledged: false,
      primaryAction: null,
    })?.current.id).toBe('merge')

    // Finally cleanup once verified.
    expect(journeyFor({
      plan: { ...base, cleanup: cleanup({ available: true }) },
      aiReview: null,
      aiAcknowledged: false,
      primaryAction: null,
    })?.current.id).toBe('cleanup')
  })

  it('skips the review chain when only safety blockers remain', () => {
    // A repo can be review-required purely because the working tree is dirty
    // after an apply (50/50, nothing to apply). The journey must go straight
    // to post-apply housekeeping instead of demanding another Jasper review.
    const afterApply = plan({
      disposition: 'review-required',
      sourceAlignment: 'current',
      actionCounts: { preserve: 2, add: 0, review: 0, unavailable: 0 },
      policy: { state: 'aligned', differences: [] },
      drift: {
        files: [],
        counts: { current: 2, 'missing-target': 0, drifted: 0, 'source-unavailable': 0 },
      },
      cleanup: {
        branch: 'upgrade/tctbp-0.3.0-aaaaaaa',
        available: false,
        reason: 'You are currently on upgrade/tctbp-0.3.0-aaaaaaa; switch back to the environment branch before removing it.',
      },
    })
    expect(journeyFor({
      plan: afterApply,
      primaryAction: 'checkpoint',
    })?.current.id).toBe('checkpoint')
  })

  it('counts applicable apply steps like the upgrade panel', () => {
    // Drifted policy merge + drifted review file.
    expect(applicableUpgradeStepCount(plan())).toBe(2)
    // Drifted policy + drifted file + missing file.
    expect(applicableUpgradeStepCount(plan({
      actionCounts: { preserve: 1, add: 1, review: 1, unavailable: 0 },
    }))).toBe(3)
  })
})
