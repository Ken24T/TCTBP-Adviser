import { describe, expect, it } from 'vitest'
import type { AiReviewResult } from '../shared/ai-review'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import type { UpgradeJourneyInput } from './upgrade-journey'
import { batchableJourney } from './upgrade-batch'

function review(): AiReviewResult {
  return {
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
}

function workPlan(overrides: Partial<TctbpUpgradePlan> = {}): TctbpUpgradePlan {
  return {
    fingerprint: 'fp',
    disposition: 'review-required',
    sourceAlignment: 'outdated',
    actionCounts: { preserve: 0, add: 1, review: 0, unavailable: 0 },
    blockers: [],
    policy: { state: 'aligned', differences: [] },
    source: {
      state: 'available',
      repository: 'TCTBP-Web',
      revision: 'a'.repeat(40),
      version: '0.3.0',
      managedFileCount: 1,
      message: null,
    },
    target: {
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'a'.repeat(40),
      sourceVersion: '0.3.0',
    },
    drift: {
      files: [],
      counts: { current: 0, 'missing-target': 1, drifted: 0, 'source-unavailable': 0 },
    },
    ...overrides,
  }
}

function input(overrides: Partial<UpgradeJourneyInput> = {}): UpgradeJourneyInput {
  return {
    plan: workPlan(),
    aiReview: review(),
    aiAcknowledged: true,
    primaryAction: 'update-tctbp',
    ...overrides,
  }
}

describe('batchableJourney', () => {
  it('is safe once every remaining stage is execution', () => {
    const batch = batchableJourney(input())
    expect(batch.safe).toBe(true)
    expect(batch.stages.length).toBeGreaterThan(0)
  })

  it('is not safe while the human review gate is pending', () => {
    const batch = batchableJourney(input({ aiReview: null }))
    expect(batch.safe).toBe(false)
    expect(batch.reason).toContain('Jasper review')
  })

  it('is not safe before the review is acknowledged', () => {
    const batch = batchableJourney(input({ aiAcknowledged: false }))
    expect(batch.safe).toBe(false)
  })

  it('is not safe when the plan is blocked', () => {
    const batch = batchableJourney(input({
      plan: workPlan({
        blockers: [{ code: 'working-tree-dirty', message: 'Working tree is dirty.' }],
      }),
    }))
    expect(batch.safe).toBe(false)
    expect(batch.reason).toContain('blocked')
  })

  it('is not safe when no upgrade journey is in play', () => {
    const batch = batchableJourney(input({ plan: null, primaryAction: null }))
    expect(batch.safe).toBe(false)
    expect(batch.stages).toHaveLength(0)
  })
})
