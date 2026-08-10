import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AiReviewResult } from '../shared/ai-review'
import type { RecommendationAction } from '../shared/recommendation'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import { UpgradeJourneyStrip } from './components/UpgradeJourneyStrip'

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
      revision: 'a'.repeat(40),
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

function render(props: {
  plan?: TctbpUpgradePlan | null
  aiReview?: AiReviewResult | null
  aiAcknowledged?: boolean
  primaryAction?: RecommendationAction | null
}) {
  return renderToStaticMarkup(
    <UpgradeJourneyStrip
      plan={props.plan === undefined ? plan() : props.plan}
      aiReview={props.aiReview === undefined ? null : props.aiReview}
      aiAcknowledged={props.aiAcknowledged ?? false}
      primaryAction={props.primaryAction ?? 'update-tctbp'}
      onAiAcknowledgedChange={() => undefined}
      busy={false}
      aiBusy={false}
      applyBusy={false}
      actionBusy={false}
      onLoad={() => undefined}
      onReviewAi={() => undefined}
      onApplyInOrder={() => undefined}
      onRunRecommended={() => undefined}
      onCleanupUpgradeBranch={() => undefined}
      onRefresh={() => undefined}
    />,
  )
}

describe('upgrade journey strip', () => {
  it('hides when no upgrade work is in play', () => {
    expect(render({ plan: null, primaryAction: 'checkpoint' })).toBe('')
  })

  it('offers to prepare the plan when the card recommends an update', () => {
    const markup = render({ plan: null, primaryAction: 'update-tctbp' })
    expect(markup).toContain('Upgrade journey')
    expect(markup).toContain('Prepare the upgrade plan')
    expect(markup).toContain('Preview upgrade plan')
  })

  it('shows the Jasper review step with a single action button', () => {
    const markup = render({})
    expect(markup).toContain('Review the plan with Jasper')
    expect(markup).toContain('Ask Jasper to review')
    // The breadcrumb shows the single pending stage.
    expect(markup).toContain('>Review</span>')
  })

  it('offers to apply once reviewed and acknowledged', () => {
    const markup = render({
      aiReview: review(),
      aiAcknowledged: true,
    })
    expect(markup).toContain('Apply the upgrade (2 steps)')
    expect(markup).toContain('Apply the upgrade')
  })

  it('offers cleanup when the merged upgrade branch is verified', () => {
    const cleanupPlan = plan({
      disposition: 'current',
      sourceAlignment: 'current',
      actionCounts: { preserve: 2, add: 0, review: 0, unavailable: 0 },
      policy: { state: 'aligned', differences: [] },
      drift: {
        files: [],
        counts: { current: 2, 'missing-target': 0, drifted: 0, 'source-unavailable': 0 },
      },
      cleanup: {
        branch: 'upgrade/tctbp-0.3.0-aaaaaaa',
        available: true,
        reason: null,
      },
    })
    const markup = render({
      plan: cleanupPlan,
      primaryAction: null,
    })
    expect(markup).toContain('Remove the merged upgrade branch')
    expect(markup).toContain('Clean up upgrade branch')
  })

  it('guides the merge-back step with a refresh affordance', () => {
    const mergePlan = plan({
      disposition: 'current',
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
        reason: 'upgrade/tctbp-0.3.0-aaaaaaa has not been merged back into main yet — merge and push it first, then it can be removed safely.',
      },
    })
    const markup = render({
      plan: mergePlan,
      primaryAction: null,
    })
    expect(markup).toContain('Merge the upgrade branch back')
    expect(markup).toContain('Refresh after merging')
    expect(markup).not.toContain('Clean up upgrade branch')
  })
})
