import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { recommend } from '../server/recommendations/engine'
import { planIntent } from '../server/intents/planner'
import { observationFixture } from '../test/observation-fixture'
import { RepositoryDetail } from './components/RepositoryDetail'
import { repositoryReference } from '../server/reference/catalogue'
import type { PortfolioPreferences } from '../shared/portfolio-preferences'
import type { RepositoryDetailResult } from '../shared/repository-detail'

describe('repository detail view', () => {
  it('renders repository state, recommendation, effects and policy evidence', () => {
    const observation = observationFixture({ clean: false })
    const recommendation = recommend(
      observation,
      'none',
      new Date(observation.observedAt),
    )
    const markup = renderToStaticMarkup(
      <RepositoryDetail
        actionJob={null}
        actionBusy={false}

        actionFeedback={null}
        onRunAction={() => undefined}
        onAddOrigin={() => undefined}
        onCreateOrigin={() => undefined}
        onRepairCompatibility={() => undefined}
        detail={{
          observation,
          recommendation,
          intentPlan: null,
          reference: repositoryReference(observation),
          github: disabledGitHub(),
          directoryName: 'fixture',
        }}
        intent="none"
        busy={false}
        upgradePlan={null}
        upgradeBusy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={null}
        aiBusy={false}
        aiAcknowledged={false}
        onAiAcknowledgedChange={() => undefined}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onIntentChange={() => undefined}
        onRefresh={() => undefined}
        onRunRecommended={() => undefined}
        onLoadUpgradePlan={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
        onMergeUpgradeBranch={() => undefined}
        batchRun={null}
        batchBusy={false}
        onRunBatch={() => undefined}
      />,
    )

    expect(markup).toContain('fixture')
    expect(markup).toContain('Checkpoint')
    expect(markup).toContain('Recommended: Checkpoint')
    expect(markup).toContain('Run Checkpoint')
    expect(markup).toContain('checkpoint please')
    expect(markup).toContain('1 staged')
    expect(markup).toContain('development')
    expect(markup).toContain('ad-detail-themed')
    expect(markup).toContain('Configured local repository')

    // Minimalist layout: with no intent plan and no upgrade journey, the
    // plan/recommendation grid is hidden entirely — the bar already explains
    // the recommendation and the does/does-not detail lives in step callouts.
    expect(markup).toContain('TCTBP profile')
    expect(markup).not.toContain('Why this is recommended')
    expect(markup).not.toContain('What this action does')
    expect(markup).not.toContain('What this action does not do')
    expect(markup).not.toContain('Quality gates')
    expect(markup).not.toContain('Required before ship')
    expect(markup).not.toContain('No fetch was performed')
    expect(markup).not.toContain('Preview upgrade plan')

    // "Verify with status" lives in the outcome dropdown's Actions group.
    expect(markup).toContain('<optgroup label="Actions">')
    expect(markup).toContain('Verify with status')
  })

  it('omits the recommendation strip for a healthy repository without an intent', () => {
    const observation = observationFixture()
    const recommendation = recommend(
      observation,
      'none',
      new Date(observation.observedAt),
    )
    const markup = renderDetail({
      observation,
      recommendation,
      intentPlan: null,
      reference: repositoryReference(observation),
      github: disabledGitHub(),
      directoryName: 'fixture',
    })

    // Healthy repos already read "no action needed" in the bar, and the
    // does/does-not cards would be empty — the strip is redundant.
    expect(recommendation.severity).toBe('healthy')
    expect(markup).not.toContain('Why this is recommended')
    expect(markup).not.toContain('What this action does')
    expect(markup).not.toContain('What this action does not do')
  })

  it('renders the explicit machine-transfer intent path', () => {
    const observation = observationFixture()
    const recommendation = recommend(
      observation,
      'none',
      new Date(observation.observedAt),
    )
    const intentPlan = planIntent(
      observation,
      recommendation,
      'continue-on-another-machine',
    )
    const markup = renderToStaticMarkup(
      <RepositoryDetail
        actionJob={null}
        actionBusy={false}

        actionFeedback={null}
        onRunAction={() => undefined}
        onAddOrigin={() => undefined}
        onCreateOrigin={() => undefined}
        onRepairCompatibility={() => undefined}
        detail={{
          observation,
          recommendation,
          intentPlan,
          reference: repositoryReference(observation),
          github: disabledGitHub(),
          directoryName: 'fixture',
        }}
        intent="continue-on-another-machine"
        busy={false}
        upgradePlan={null}
        upgradeBusy={false}
        applyBusy={false}
        upgradeFeedback={null}
        aiReview={null}
        aiBusy={false}
        aiAcknowledged={false}
        onAiAcknowledgedChange={() => undefined}
        bootstrapPlan={null}
        bootstrapBusy={false}
        bootstrapApplyBusy={false}
        bootstrapApplyFeedback={null}
        bootstrapJob={null}
        onPrepareBootstrap={() => undefined}
        onApplyBootstrap={() => undefined}
        onIntentChange={() => undefined}
        onRefresh={() => undefined}        onRunRecommended={() => undefined}        onLoadUpgradePlan={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onApplyDrifted={() => undefined}
        onApplyAlignment={() => undefined}
        onDeleteObsolete={() => undefined}
        onApplyInOrder={() => undefined}
        onCleanupUpgradeBranch={() => undefined}
        onMergeUpgradeBranch={() => undefined}
        batchRun={null}
        batchBusy={false}
        onRunBatch={() => undefined}
      />,
    )

    expect(markup).toContain('Handover')
    expect(markup).toContain('handover please')
    expect(markup).toContain('Continue on another machine')
    // With an intent plan present, the explanation lives in the step
    // callouts; the separate "why this is recommended" strip is hidden.
    expect(markup).not.toContain('Why this is recommended')
    expect(markup).toContain('Intent-driven plan')
  })

  it('shows rename, then display name, then directory name on the header', () => {
    const observation = observationFixture({ clean: false })
    const recommendation = recommend(
      observation,
      'none',
      new Date(observation.observedAt),
    )
    const detail: RepositoryDetailResult = {
      observation,
      recommendation,
      intentPlan: null,
      reference: repositoryReference(observation),
      github: disabledGitHub(),
      directoryName: 'Fixture Directory',
    }

    // Without a rename the header shows the repository display name (the
    // TCTBP project name), matching the portfolio card.
    expect(renderDetail(detail)).toContain('fixture')
    expect(renderDetail(detail)).not.toContain('Fixture Directory')

    // A rename overrides the display name in the header.
    const renamed = renderDetail(detail, {
      [observation.repository.id]: {
        pinned: false,
        hidden: false,
        name: 'Fixture Rename',
      },
    })
    expect(renamed).toContain('Fixture Rename')
    expect(renamed).not.toContain('Fixture Directory')

    // With neither a rename nor a display name, the directory name is used.
    const noName: RepositoryDetailResult = {
      ...detail,
      observation: {
        ...observation,
        repository: { ...observation.repository, name: '' },
      },
    }
    expect(renderDetail(noName)).toContain('Fixture Directory')
  })
})

function renderDetail(
  detail: RepositoryDetailResult,
  preferences: PortfolioPreferences = {},
): string {
  return renderToStaticMarkup(
    <RepositoryDetail
      detail={detail}
      preferences={preferences}
      actionJob={null}
      actionBusy={false}
      actionFeedback={null}
      onRunAction={() => undefined}
      onAddOrigin={() => undefined}
      onCreateOrigin={() => undefined}
      onRepairCompatibility={() => undefined}
      intent="none"
      busy={false}
      upgradePlan={null}
      upgradeBusy={false}
      applyBusy={false}
      upgradeFeedback={null}
      aiReview={null}
      aiBusy={false}
      aiAcknowledged={false}
      onAiAcknowledgedChange={() => undefined}
      bootstrapPlan={null}
      bootstrapBusy={false}
      bootstrapApplyBusy={false}
      bootstrapApplyFeedback={null}
      bootstrapJob={null}
      onPrepareBootstrap={() => undefined}
      onApplyBootstrap={() => undefined}
      onIntentChange={() => undefined}
      onRefresh={() => undefined}
      onRunRecommended={() => undefined}
      onLoadUpgradePlan={() => undefined}
      onReviewAi={() => undefined}
      onApplyAdditions={() => undefined}
      onApplyPolicy={() => undefined}
      onApplyDrifted={() => undefined}
      onApplyAlignment={() => undefined}
      onDeleteObsolete={() => undefined}
      onApplyInOrder={() => undefined}
      onCleanupUpgradeBranch={() => undefined}
      onMergeUpgradeBranch={() => undefined}
      batchRun={null}
      batchBusy={false}
      onRunBatch={() => undefined}
    />,
  )
}

function disabledGitHub() {
  return {
    status: 'disabled',
    basis: 'github-rest-api',
    retrievedAt: null,
  } as const
}
