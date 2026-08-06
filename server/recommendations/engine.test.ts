import { describe, expect, it } from 'vitest'
import type {
  RecommendationAction,
  RecommendationDisposition,
  RecommendationReasonCode,
} from '../../shared/recommendation'
import {
  observationFixture,
  type ObservationOptions,
} from '../../test/observation-fixture'
import { recommend } from './engine'

const NOW = new Date('2026-07-30T01:00:01.000Z')

interface RuleCase {
  name: string
  options?: ObservationOptions
  disposition: RecommendationDisposition
  action: RecommendationAction | null
  reason: RecommendationReasonCode
}

const RULE_CASES: RuleCase[] = [
  {
    name: 'clean and in sync',
    disposition: 'none',
    action: null,
    reason: 'no-action-required',
  },
  {
    name: 'dirty and in sync',
    options: { clean: false },
    disposition: 'action',
    action: 'checkpoint',
    reason: 'working-tree-dirty',
  },
  {
    name: 'clean and ahead',
    options: { syncState: 'ahead' },
    disposition: 'action',
    action: 'publish',
    reason: 'branch-ahead',
  },
  {
    name: 'clean and unpublished',
    options: { syncState: 'unpublished' },
    disposition: 'action',
    action: 'publish',
    reason: 'branch-unpublished',
  },
  {
    name: 'clean and behind',
    options: { syncState: 'behind' },
    disposition: 'action',
    action: 'resume',
    reason: 'branch-behind',
  },
  {
    name: 'diverged',
    options: { syncState: 'diverged' },
    disposition: 'stop',
    action: null,
    reason: 'branch-diverged',
  },
  {
    name: 'active operation',
    options: { operations: ['merge'] },
    disposition: 'inspect',
    action: null,
    reason: 'active-git-operation',
  },
  {
    name: 'conflicts without a recognised marker',
    options: { clean: false, conflicted: 1 },
    disposition: 'inspect',
    action: null,
    reason: 'index-conflicted',
  },
  {
    name: 'detached HEAD',
    options: { detached: true },
    disposition: 'stop',
    action: null,
    reason: 'detached-head',
  },
  {
    name: 'unborn repository',
    options: { unborn: true },
    disposition: 'stop',
    action: null,
    reason: 'unborn-repository',
  },
  {
    name: 'dirty and behind',
    options: { clean: false, syncState: 'behind' },
    disposition: 'sequence',
    action: 'checkpoint',
    reason: 'working-tree-dirty-and-behind',
  },
  {
    name: 'TCTBP missing',
    options: { tctbpInstalled: false, tctbpCompatible: false },
    disposition: 'stop',
    action: null,
    reason: 'tctbp-not-installed',
  },
  {
    name: 'contract incompatible',
    options: { tctbpCompatible: false },
    disposition: 'stop',
    action: null,
    reason: 'tctbp-contract-incompatible',
  },
  {
    name: 'tracking state unknown',
    options: { syncState: 'unknown' },
    disposition: 'inspect',
    action: 'refresh-inspection',
    reason: 'inspection-required',
  },
]

describe('deterministic recommendation engine', () => {
  it.each(RULE_CASES)(
    '$name -> $disposition/$action',
    ({ options, disposition, action, reason }) => {
      const result = recommend(
        observationFixture(options),
        'none',
        NOW,
      )

      expect(result.disposition).toBe(disposition)
      expect(result.primaryAction).toBe(action)
      expect(result.reasonCodes).toContain(reason)
      expect(result.confidence).toBe('deterministic')
      expect(result.evidence.length).toBeGreaterThan(0)
      expect(result.freshness).toMatchObject({
        stale: false,
        basis: 'local-working-copy-and-local-tracking-refs',
      })
      expect(result.observationIds).toHaveLength(1)
    },
  )

  it('makes dirty-plus-behind a preservation and inspection sequence', () => {
    const result = recommend(
      observationFixture({ clean: false, syncState: 'behind' }),
      'none',
      NOW,
    )

    expect(result.steps.map((step) => step.action)).toEqual([
      'checkpoint',
      'inspect-recovery',
    ])
    expect(result.likelyNextActions).toEqual(['inspect-recovery'])
    expect(result.blockedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'resume' }),
      expect.objectContaining({ action: 'publish' }),
      expect.objectContaining({ action: 'handover' }),
    ]))
  })

  it('lets operation and conflict safety outrank dirty-state advice', () => {
    const result = recommend(
      observationFixture({
        clean: false,
        operations: ['rebase'],
        conflicted: 2,
      }),
      'none',
      NOW,
    )

    expect(result.primaryAction).toBeNull()
    expect(result.reasonCodes).toEqual([
      'active-git-operation',
      'index-conflicted',
    ])
    expect(result.steps.map((step) => step.action)).toEqual([
      'inspect-recovery',
      'abort-dry-run',
    ])
    expect(result.steps[1].trigger).toBeNull()
  })

  it.each([
    'in-sync',
    'ahead',
    'behind',
    'diverged',
    'unpublished',
    'unknown',
  ] as const)(
    'never makes resume immediately executable when %s state is dirty',
    (syncState) => {
      const result = recommend(
        observationFixture({ clean: false, syncState }),
        'none',
        NOW,
      )
      expect(result.primaryAction).not.toBe('resume')
      expect(result.steps[0]?.action).not.toBe('resume')
    },
  )

  it('never represents divergence as resumable', () => {
    for (const clean of [true, false]) {
      for (const operations of [[], ['merge'] as const]) {
        const result = recommend(
          observationFixture({
            clean,
            syncState: 'diverged',
            operations: [...operations],
          }),
          'none',
          NOW,
        )
        expect(result.primaryAction).not.toBe('resume')
        expect(result.steps.map((step) => step.action)).not.toContain('resume')
      }
    }
  })

  it('applies machine-transfer intent only after safety rules pass', () => {
    const ready = recommend(
      observationFixture({ clean: false }),
      'continue-on-another-machine',
      NOW,
    )
    const blocked = recommend(
      observationFixture({ clean: false, syncState: 'behind' }),
      'continue-on-another-machine',
      NOW,
    )

    expect(ready).toMatchObject({
      disposition: 'action',
      primaryAction: 'handover',
      trigger: 'handover please',
      reasonCodes: ['handover-ready'],
      intent: 'continue-on-another-machine',
    })
    expect(ready.evidence).toContainEqual(expect.objectContaining({
      field: 'intent',
      basis: 'user-input',
    }))
    expect(blocked.primaryAction).toBe('checkpoint')
    expect(blocked.reasonCodes).toContain('working-tree-dirty-and-behind')
  })

  it('withholds advice when the observation is stale', () => {
    const result = recommend(
      observationFixture({ observedAt: '2026-07-30T00:59:00.000Z' }),
      'none',
      NOW,
    )

    expect(result).toMatchObject({
      disposition: 'inspect',
      primaryAction: 'refresh-inspection',
      reasonCodes: ['inspection-required'],
      freshness: { stale: true, ageMs: 61_000 },
    })
    expect(result.uncertainties).toContainEqual(
      expect.objectContaining({ code: 'observation-stale-or-invalid' }),
    )
  })

  it('withholds an action that the target does not advertise', () => {
    const result = recommend(
      observationFixture({
        clean: false,
        workflows: ['status', 'publish', 'resume', 'handover'],
      }),
      'none',
      NOW,
    )

    expect(result).toMatchObject({
      disposition: 'inspect',
      primaryAction: null,
      reasonCodes: ['inspection-required'],
    })
    expect(result.uncertainties).toContainEqual(
      expect.objectContaining({ code: 'workflow-unavailable' }),
    )
  })

  it('describes effects and explicit non-effects for workflow advice', () => {
    const result = recommend(
      observationFixture({ clean: false }),
      'none',
      NOW,
    )

    expect(result.effects.does).toContain(
      'Preserves tracked and untracked work in a local commit.',
    )
    expect(result.effects.doesNot).toContain(
      'Does not push, merge, tag, version, deploy or ship.',
    )
    expect(result.policySource).toMatchObject({
      engine: 'tctbp-adviser/recommendation-v1',
      tctbpSchemaVersion: 11,
      contractMajor: 1,
    })
  })
})
