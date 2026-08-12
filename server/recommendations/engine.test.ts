import { describe, expect, it } from 'vitest'
import type {
  RecommendationAction,
  RecommendationDisposition,
  RecommendationReasonCode,
} from '../../shared/recommendation'
import type { UpgradeSummaryLike } from './rules'
import {
  observationFixture,
  type ObservationOptions,
} from '../../test/observation-fixture'
import { recommend } from './engine'

const NOW = new Date('2026-07-30T01:00:01.000Z')

interface RuleCase {
  name: string
  options?: ObservationOptions
  upgrade?: UpgradeSummaryLike | null
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
    name: 'clean and unpublished without a remote origin',
    options: { syncState: 'unpublished', remoteOrigin: null },
    disposition: 'inspect',
    action: null,
    reason: 'remote-origin-missing',
  },
  {
    name: 'clean without a remote origin but with a TCTBP update available',
    options: { syncState: 'unpublished', remoteOrigin: null },
    upgrade: {
      disposition: 'review-required',
      actionCounts: { preserve: 0, add: 1, review: 1, unavailable: 0 },
    },
    disposition: 'action',
    action: 'update-tctbp',
    reason: 'tctbp-update-available',
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
    name: 'contract incompatible with local changes',
    options: { tctbpCompatible: false, clean: false },
    disposition: 'sequence',
    action: 'checkpoint',
    reason: 'working-tree-dirty',
  },
  {
    name: 'contract incompatible with conflicts stays a stop',
    options: { tctbpCompatible: false, clean: false, conflicted: 1 },
    disposition: 'stop',
    action: null,
    reason: 'tctbp-contract-incompatible',
  },
  {
    name: 'TCTBP update available',
    upgrade: {
      disposition: 'review-required',
      actionCounts: { preserve: 0, add: 43, review: 6, unavailable: 0 },
    },
    disposition: 'action',
    action: 'update-tctbp',
    reason: 'tctbp-update-available',
  },
  {
    name: 'TCTBP current stays no-action',
    upgrade: { disposition: 'current' },
    disposition: 'none',
    action: null,
    reason: 'no-action-required',
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
    ({ options, upgrade, disposition, action, reason }) => {
      const result = recommend(
        observationFixture(options),
        'none',
        NOW,
        undefined,
        upgrade ?? null,
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

  it('never offers publish when no remote origin is configured', () => {
    const result = recommend(
      observationFixture({ syncState: 'unpublished', remoteOrigin: null }),
      'none',
      NOW,
    )

    expect(result.primaryAction).not.toBe('publish')
    expect(result.reasonCodes).toContain('remote-origin-missing')
    expect(result.blockedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'publish' }),
      expect.objectContaining({ action: 'handover' }),
    ]))
  })

  it('prefers an actionable TCTBP update over the missing-remote notice', () => {
    const result = recommend(
      observationFixture({
        syncState: 'unpublished',
        remoteOrigin: null,
      }),
      'none',
      NOW,
      undefined,
      { disposition: 'review-required' },
    )

    expect(result.primaryAction).toBe('update-tctbp')
    expect(result.reasonCodes).toContain('tctbp-update-available')
    expect(result.reasonCodes).not.toContain('remote-origin-missing')
  })

  it('suggests preflight as the next step for a dirty working tree', () => {
    const result = recommend(
      observationFixture({ clean: false }),
      'none',
      NOW,
    )

    expect(result.primaryAction).toBe('checkpoint')
    expect(result.reasonCodes).toContain('working-tree-dirty')
    expect(result.likelyNextActions).toContain('preflight')
    expect(result.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'checkpoint' }),
    ]))
  })

  it('recommends a TCTBP update for an otherwise-healthy but out-of-date repo', () => {
    const result = recommend(
      observationFixture(),
      'none',
      NOW,
      undefined,
      {
        disposition: 'review-required',
        actionCounts: { preserve: 0, add: 43, review: 6, unavailable: 0 },
      },
    )

    expect(result.disposition).toBe('action')
    expect(result.primaryAction).toBe('update-tctbp')
    expect(result.severity).toBe('attention')
    expect(result.reasonCodes).toEqual(['tctbp-update-available'])
    expect(result.steps.map((step) => step.action)).toEqual(['update-tctbp'])
    expect(result.likelyNextActions).toEqual([])
    expect(result.blockedActions).toEqual([])
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'upgrade.disposition', value: 'review-required' }),
      expect.objectContaining({ field: 'upgrade.actionCounts.add', value: 43 }),
      expect.objectContaining({ field: 'upgrade.actionCounts.review', value: 6 }),
    ]))
  })

  it('keeps dirty work ahead of an available TCTBP update', () => {
    const result = recommend(
      observationFixture({ clean: false }),
      'none',
      NOW,
      undefined,
      { disposition: 'review-required' },
    )

    expect(result.primaryAction).toBe('checkpoint')
    expect(result.reasonCodes).toContain('working-tree-dirty')
  })

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

  it('makes incompatible-with-local-changes a checkpoint-first sequence', () => {
    // Incompatible contracts advertise no workflows, so this must not depend
    // on checkpoint appearing in the advertised list.
    const result = recommend(
      observationFixture({
        tctbpCompatible: false,
        clean: false,
        workflows: [],
      }),
      'none',
      NOW,
    )

    expect(result.disposition).toBe('sequence')
    expect(result.primaryAction).toBe('checkpoint')
    expect(result.reasonCodes).toEqual([
      'working-tree-dirty',
      'tctbp-contract-incompatible',
    ])
    expect(result.steps.map((step) => step.action)).toEqual([
      'checkpoint',
      'review-compatibility',
    ])
    expect(result.likelyNextActions).toEqual(['review-compatibility'])
    expect(result.blockedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'publish' }),
      expect.objectContaining({ action: 'resume' }),
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
