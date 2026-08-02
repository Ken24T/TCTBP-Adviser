import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
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
        onDeleteObsolete={() => undefined}
      />,
    )

    expect(markup).toContain('Review required')
    expect(markup).toContain('outdated')
    expect(markup).toContain('Blocked:')
    expect(markup).toContain('Candidate guard is missing.')
    expect(markup).toContain('Ask Jasper to review this plan')
    expect(markup).toContain('Download Markdown')
    expect(markup).toContain('Download JSON')
    expect(markup).toContain('Copy Markdown')
    expect(markup).toContain('TCTBP-Web')
    expect(markup).toContain('0.3.0')
    expect(markup).toContain('Drifted')
    expect(markup).toContain('scripts/tctbp-core.js')
    expect(markup).toContain('Apply additions (no commit/push)')
  })
})
