import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AiReviewResult } from '../shared/ai-review'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import { TctbpUpgradePanel } from './components/TctbpUpgradePanel'

describe('TCTBP upgrade preview panel', () => {
  it('renders canonical source and drift summary without mutation controls', () => {
    const plan: TctbpUpgradePlan = {
      disposition: 'review-required',
      sourceAlignment: 'outdated',
      actionCounts: { preserve: 0, add: 0, review: 1, unavailable: 0 },
      blockers: [
        { code: 'different-source', message: 'Candidate guard is missing.' },
      ],
      policy: {
        state: 'drifted',
        differences: [{ area: 'hardening', message: 'Candidate guard is missing.' }],
      },
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
            sourceHash: 'source',
            targetHash: 'target',
          },
        ],
        counts: {
          current: 0,
          'missing-target': 0,
          drifted: 1,
          'source-unavailable': 0,
        },
      },
    }

    const markup = renderToStaticMarkup(
      <TctbpUpgradePanel
        repositoryName="example-repository"
        plan={plan}
        busy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={null}
        aiBusy={false}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onLoad={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
      />,
    )

    expect(markup).toContain('Review required')
    expect(markup).toContain('outdated')
    expect(markup).toContain('Blocked:')
    expect(markup).toContain('Candidate guard is missing.')
    expect(markup).toContain('How to resolve: Regenerate from the canonical Ken24T/TCTBP-Web source.')
    expect(markup).toContain('This repository is blocked — resolve the blocker below, then apply in order.')
    expect(markup).toContain('Ask Jasper to review this plan')
    expect(markup).toContain('Download Markdown')
    expect(markup).toContain('Download JSON')
    expect(markup).toContain('Copy Markdown')
    expect(markup).toContain('TCTBP-Web')
    expect(markup).toContain('0.3.0')
    expect(markup).toContain('Drifted')
    expect(markup).toContain('scripts/tctbp-core.js')
    expect(markup).toContain('Apply in this order')
    expect(markup).toContain('Apply policy merge')
    expect(markup).toContain('Apply drifted files')
    expect(markup).toContain('Reconcile 1 drifted managed file with the canonical source.')
    expect(markup).toContain('Nothing to apply for this repository.')
  })

  it('frames a dirty working tree as commit-before-continuing, not a failure', () => {
    const plan = {
      disposition: 'review-required' as const,
      sourceAlignment: 'outdated' as const,
      actionCounts: { preserve: 0, add: 1, review: 1, unavailable: 0 },
      blockers: [
        { code: 'working-tree-dirty' as const, message: 'The target working tree contains local changes.' },
      ],
      policy: { state: 'drifted' as const, differences: [] },
      source: {
        state: 'available' as const,
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
        files: [],
        counts: { current: 0, 'missing-target': 1, drifted: 0, 'source-unavailable': 0 },
      },
    } satisfies TctbpUpgradePlan

    const markup = renderToStaticMarkup(
      <TctbpUpgradePanel
        repositoryName="example-repository"
        plan={plan}
        busy={false}
        applyBusy={false}
        upgradeFeedback="Applied 1 change(s). Review the working tree, then checkpoint from the card."
        aiReview={null}
        aiBusy={false}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onLoad={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
      />,
    )

    expect(markup).toContain('Commit before continuing:')
    expect(markup).toContain('often a successful apply')
    expect(markup).toContain('The working tree has local changes — checkpoint or commit them, then continue applying.')
    expect(markup).toContain('Applied 1 change(s). Review the working tree, then checkpoint from the card.')
    expect(markup).not.toContain('Blocked:')
  })

  it('connects the incompatible-contract recommendation to the preview button', () => {
    const markup = renderToStaticMarkup(
      <TctbpUpgradePanel
        repositoryName="example-repository"
        plan={null}
        busy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={null}
        aiBusy={false}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        contractIncompatible
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onLoad={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
      />,
    )

    expect(markup).toContain('Review TCTBP:')
    expect(markup).toContain('TCTBP contract is incompatible with the canonical source')
    expect(markup).toContain('Preview the upgrade plan below to see what needs reconciling')
    expect(markup).toContain('Preview upgrade plan')
  })

  it('disables the review confirmation when Jasper finds nothing to apply', () => {
    const plan = {
      fingerprint: 'fp',
      disposition: 'current' as const,
      sourceAlignment: 'current' as const,
      actionCounts: { preserve: 2, add: 0, review: 0, unavailable: 0 },
      blockers: [],
      policy: { state: 'aligned' as const, differences: [] },
      source: {
        state: 'available' as const,
        repository: 'TCTBP-Web',
        revision: 'a'.repeat(40),
        version: '0.3.0',
        managedFileCount: 2,
        message: null,
      },
      target: {
        sourceRepository: 'Ken24T/TCTBP-Web',
        sourceRevision: 'a'.repeat(40),
        sourceVersion: '0.3.0',
      },
      drift: {
        files: [],
        counts: { current: 2, 'missing-target': 0, drifted: 0, 'source-unavailable': 0 },
      },
    } satisfies TctbpUpgradePlan
    const review: AiReviewResult = {
      status: 'available',
      reviewId: 'review-1',
      reviewedAt: new Date().toISOString(),
      provider: 'openai-compatible',
      model: 'test-model',
      planFingerprint: 'fp',
      summary: 'Nothing to apply.',
      risks: [],
      recommendedNextStep: 'No action needed.',
      confidence: 'high',
      unknowns: [],
      error: null,
    }

    const markup = renderToStaticMarkup(
      <TctbpUpgradePanel
        repositoryName="example-repository"
        plan={plan}
        busy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={review}
        aiBusy={false}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onLoad={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
      />,
    )

    expect(markup).toContain('I have reviewed Jasper’s advisory and the deterministic plan.')
    expect(markup).toContain('nothing to apply, so no confirmation is needed.')
    // Disabled styling: the checkbox cannot be ticked for a plan with no work.
    expect(markup).toContain('cursor-default opacity-60')
  })

  it('hides the preview button once the plan is loaded', () => {
    const plan = {
      disposition: 'review-required' as const,
      sourceAlignment: 'outdated' as const,
      actionCounts: { preserve: 0, add: 1, review: 1, unavailable: 0 },
      blockers: [],
      policy: { state: 'drifted' as const, differences: [] },
      source: {
        state: 'available' as const,
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
        files: [],
        counts: { current: 0, 'missing-target': 1, drifted: 0, 'source-unavailable': 0 },
      },
    } satisfies TctbpUpgradePlan

    const markup = renderToStaticMarkup(
      <TctbpUpgradePanel
        repositoryName="example-repository"
        plan={plan}
        busy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={null}
        aiBusy={false}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onLoad={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
      />,
    )

    expect(markup).not.toContain('Preview upgrade plan')
    expect(markup).toContain('Ask Jasper to review this plan')
  })

  it('offers to record source alignment when only provenance is missing', () => {
    const plan = {
      disposition: 'review-required' as const,
      sourceAlignment: 'unknown' as const,
      actionCounts: { preserve: 49, add: 0, review: 0, unavailable: 0 },
      blockers: [],
      policy: { state: 'aligned' as const, differences: [] },
      source: {
        state: 'available' as const,
        repository: 'TCTBP-Web',
        revision: 'a'.repeat(40),
        version: '0.2.0',
        managedFileCount: 49,
        message: null,
      },
      target: {
        sourceRepository: null,
        sourceRevision: null,
        sourceVersion: null,
      },
      drift: {
        files: [],
        counts: { current: 49, 'missing-target': 0, drifted: 0, 'source-unavailable': 0 },
      },
    } satisfies TctbpUpgradePlan

    const markup = renderToStaticMarkup(
      <TctbpUpgradePanel
        repositoryName="example-repository"
        plan={plan}
        busy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={null}
        aiBusy={false}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onLoad={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
      />,
    )

    expect(markup).toContain('Record source alignment')
    expect(markup).toContain('Write .tctbp/source.json so future plans can confirm alignment.')
    expect(markup).toContain('Apply in order (1 step)')
  })

  it('requires bootstrap preparation before enabling Jasper review', () => {
    const plan = {
      disposition: 'bootstrap-required' as const,
      sourceAlignment: 'unknown' as const,
      actionCounts: { preserve: 0, add: 1, review: 0, unavailable: 0 },
      blockers: [],
      policy: { state: 'unavailable' as const, differences: [] },
      source: {
        state: 'available' as const,
        repository: 'TCTBP-Web',
        revision: 'a'.repeat(40),
        version: '0.3.0',
        managedFileCount: 1,
        message: null,
      },
      target: {
        sourceRepository: null,
        sourceRevision: null,
        sourceVersion: null,
      },
      drift: {
        files: [],
        counts: { current: 0, 'missing-target': 1, drifted: 0, 'source-unavailable': 0 },
      },
    } satisfies TctbpUpgradePlan
    const markup = renderToStaticMarkup(
      <TctbpUpgradePanel
        repositoryName="fixture"
        plan={plan}
        busy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={null}
        aiBusy={false}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onLoad={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
      />,
    )

    expect(markup).toContain('Prepare bootstrap plan first')
    expect(markup).not.toContain('Ask Jasper to review this plan')
  })

  it('offers upgrade-branch cleanup only when verified safe', () => {
    const plan = {
      disposition: 'current' as const,
      sourceAlignment: 'current' as const,
      actionCounts: { preserve: 1, add: 0, review: 0, unavailable: 0 },
      blockers: [],
      policy: { state: 'aligned' as const, differences: [] },
      source: {
        state: 'available' as const,
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
      cleanup: {
        branch: 'upgrade/tctbp-0.3.0-aaaaaaa',
        available: true,
        reason: null,
      },
      drift: {
        files: [],
        counts: { current: 1, 'missing-target': 0, drifted: 0, 'source-unavailable': 0 },
      },
    } satisfies TctbpUpgradePlan

    const markup = renderToStaticMarkup(
      <TctbpUpgradePanel
        repositoryName="example-repository"
        plan={plan}
        busy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={null}
        aiBusy={false}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onLoad={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
      />,
    )

    expect(markup).toContain('Upgrade branch cleanup')
    expect(markup).toContain('Clean up upgrade branch')
    expect(markup).toContain('upgrade/tctbp-0.3.0-aaaaaaa is fully merged and safe to remove')
  })

  it('explains why upgrade-branch cleanup is not yet available', () => {
    const plan = {
      disposition: 'current' as const,
      sourceAlignment: 'current' as const,
      actionCounts: { preserve: 1, add: 0, review: 0, unavailable: 0 },
      blockers: [],
      policy: { state: 'aligned' as const, differences: [] },
      source: {
        state: 'available' as const,
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
      cleanup: {
        branch: 'upgrade/tctbp-0.3.0-aaaaaaa',
        available: false,
        reason: 'upgrade/tctbp-0.3.0-aaaaaaa has not been merged back into main yet — merge and push it first, then it can be removed safely.',
      },
      drift: {
        files: [],
        counts: { current: 1, 'missing-target': 0, drifted: 0, 'source-unavailable': 0 },
      },
    } satisfies TctbpUpgradePlan

    const markup = renderToStaticMarkup(
      <TctbpUpgradePanel
        repositoryName="example-repository"
        plan={plan}
        busy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={null}
        aiBusy={false}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onLoad={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
      />,
    )

    expect(markup).toContain('Upgrade branch cleanup')
    expect(markup).toContain('has not been merged back')
    expect(markup).not.toContain('Clean up upgrade branch')
  })

  it('shows an hourglass cursor while Jasper is thinking', () => {
    const plan = {
      disposition: 'review-required' as const,
      sourceAlignment: 'outdated' as const,
      actionCounts: { preserve: 0, add: 1, review: 0, unavailable: 0 },
      blockers: [],
      policy: { state: 'drifted' as const, differences: [] },
      source: {
        state: 'available' as const,
        repository: 'TCTBP-Web',
        revision: 'a'.repeat(40),
        version: '0.3.0',
        managedFileCount: 1,
        message: null,
      },
      target: {
        sourceRepository: 'Ken24T/TCTBP-Web',
        sourceRevision: 'b'.repeat(40),
        sourceVersion: '0.2.0',
      },
      drift: {
        files: [],
        counts: { current: 0, 'missing-target': 1, drifted: 0, 'source-unavailable': 0 },
      },
    } satisfies TctbpUpgradePlan

    const markup = renderToStaticMarkup(
      <TctbpUpgradePanel
        repositoryName="example-repository"
        plan={plan}
        busy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={null}
        aiBusy
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onLoad={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
      />,
    )

    expect(markup).toContain('Asking Jasper…')
    // Hourglass on the whole panel while the AI review is in flight…
    expect(markup).toContain('cursor-wait')
    // …and overriding the disabled button's default not-allowed cursor.
    expect(markup).toContain('disabled:!cursor-wait')
  })
})
