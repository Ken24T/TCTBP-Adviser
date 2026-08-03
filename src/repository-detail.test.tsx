import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { recommend } from '../server/recommendations/engine'
import { planIntent } from '../server/intents/planner'
import { observationFixture } from '../test/observation-fixture'
import { RepositoryDetail } from './components/RepositoryDetail'
import { repositoryReference } from '../server/reference/catalogue'

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
        detail={{
          observation,
          recommendation,
          intentPlan: null,
          reference: repositoryReference(observation),
          github: disabledGitHub(),
        }}
        intent="none"
        busy={false}
        upgradePlan={null}
        upgradeBusy={false}
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
        onIntentChange={() => undefined}
        onRefresh={() => undefined}
        onLoadUpgradePlan={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onDeleteObsolete={() => undefined}
      />,
    )

    expect(markup).toContain('fixture')
    expect(markup).toContain('Checkpoint')
    expect(markup).toContain('checkpoint please')
    expect(markup).toContain('1 staged')
    expect(markup).toContain('development')
    expect(markup).toContain('Required before ship')
    expect(markup).toContain('What this action does')
    expect(markup).toContain('What this action does not do')
    expect(markup).toContain('No fetch was performed')
    expect(markup).toContain('Preview upgrade plan')
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
        detail={{
          observation,
          recommendation,
          intentPlan,
          reference: repositoryReference(observation),
          github: disabledGitHub(),
        }}
        intent="continue-on-another-machine"
        busy={false}
        upgradePlan={null}
        upgradeBusy={false}
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
        onIntentChange={() => undefined}
        onRefresh={() => undefined}
        onLoadUpgradePlan={() => undefined}
        onReviewAi={() => undefined}
        onApplyAdditions={() => undefined}
        onApplyPolicy={() => undefined}
        onDeleteObsolete={() => undefined}
      />,
    )

    expect(markup).toContain('Handover')
    expect(markup).toContain('handover please')
    expect(markup).toContain('Continue on another machine')
    expect(markup).toContain('State-driven recommendation')
    expect(markup).toContain('Intent-driven plan')
  })
})

function disabledGitHub() {
  return {
    status: 'disabled',
    basis: 'github-rest-api',
    retrievedAt: null,
  } as const
}
