import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AiReviewResult } from '../shared/ai-review'
import type { RecommendationAction } from '../shared/recommendation'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import { NextActionBar } from './components/NextActionBar'

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
    <NextActionBar
      plan={props.plan === undefined ? plan() : props.plan}
      aiReview={props.aiReview === undefined ? null : props.aiReview}
      aiAcknowledged={props.aiAcknowledged ?? false}
      primaryAction={props.primaryAction === undefined ? 'update-tctbp' : props.primaryAction}
      recommendation={null}
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
      onMergeUpgradeBranch={() => undefined}
      onRefresh={() => undefined}
    />,
  )
}

describe('next action bar', () => {
  it('is always rendered, even when healthy', () => {
    const markup = render({ plan: null, primaryAction: null })
    expect(markup).toContain('Next action')
    expect(markup).toContain('No action needed')
    expect(markup).not.toContain('button')
  })

  it('shows a runnable recommended workflow with a single button', () => {
    const markup = render({ plan: null, primaryAction: 'checkpoint' })
    expect(markup).toContain('Recommended: Checkpoint')
    expect(markup).toContain('Run Checkpoint')
    expect(markup).not.toContain('Upgrade journey')
  })

  it('shows guidance without a run button for non-runnable recommendations', () => {
    const markup = render({ plan: null, primaryAction: 'install-tctbp' })
    expect(markup).toContain('Recommended: Install TCTBP')
    expect(markup).toContain('TCTBP is not installed')
    expect(markup).not.toContain('Run Install TCTBP')
  })

  it('shows the upgrade journey step when the journey is in play', () => {
    const markup = render({})
    expect(markup).toContain('Upgrade journey')
    expect(markup).toContain('Review the plan with Jasper')
    expect(markup).toContain('Ask Jasper to review')
  })

  it('offers apply in order from the bar at the apply stage', () => {
    const applyPlan = plan({
      actionCounts: { preserve: 0, add: 1, review: 0, unavailable: 0 },
    })
    const markup = render({
      plan: applyPlan,
      aiReview: review(),
      aiAcknowledged: true,
    })
    expect(markup).toContain('Apply in order')
    expect(markup).toMatch(/type="button">Apply in order/)
  })

  it('offers a run-all batch button only when the batch is safe', () => {
    const shared = {
      plan: plan(),
      aiReview: review(),
      aiAcknowledged: true,
      primaryAction: 'update-tctbp' as const,
      recommendation: null,
      onAiAcknowledgedChange: () => undefined,
      busy: false,
      aiBusy: false,
      applyBusy: false,
      actionBusy: false,
      onLoad: () => undefined,
      onReviewAi: () => undefined,
      onApplyInOrder: () => undefined,
      onRunRecommended: () => undefined,
      onCleanupUpgradeBranch: () => undefined,
      onMergeUpgradeBranch: () => undefined,
      onRefresh: () => undefined,
      onRunBatch: () => undefined,
    }
    const safeMarkup = renderToStaticMarkup(
      <NextActionBar
        {...shared}
        batch={{
          safe: true,
          reason: null,
          stages: [{ id: 'apply', label: 'Apply the upgrade', reason: 'r', action: 'apply' }],
        }}
      />,
    )
    expect(safeMarkup).toContain('Run all (1)')

    const unsafeMarkup = renderToStaticMarkup(
      <NextActionBar
        {...shared}
        batch={{ safe: false, reason: 'Not yet.', stages: [] }}
      />,
    )
    expect(unsafeMarkup).not.toContain('Run all')
  })

  it('runs the merge from the journey step instead of refresh guidance', () => {
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
        reason: null,
      },
    })
    const markup = render({ plan: mergePlan, primaryAction: null })
    expect(markup).toContain('Merge the upgrade branch back')
    expect(markup).toContain('Merge upgrade branch')
    expect(markup).not.toContain('Refresh after merging')
  })

  it('offers cleanup once the merged upgrade branch is verified', () => {
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
})
