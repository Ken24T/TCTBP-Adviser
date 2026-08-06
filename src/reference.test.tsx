import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { observationFixture } from '../test/observation-fixture'
import { repositoryReference, referenceCatalogue } from '../server/reference/catalogue'
import { IntentPlanPanel } from './components/IntentPlanPanel'
import { ReferenceExplorer } from './components/ReferenceExplorer'
import { RepositoryReferencePanel } from './components/RepositoryReferencePanel'
import { planIntent } from '../server/intents/planner'
import { recommend } from '../server/recommendations/engine'

describe('intent and reference views', () => {
  it('renders required and conditional intent steps without action controls', () => {
    const observation = observationFixture({
      workflows: [
        'status',
        'checkpoint',
        'publish',
        'handover',
        'resume',
        'promote',
        'deploy',
        'ship',
        'abort',
      ],
    })
    const state = recommend(
      observation,
      'none',
      new Date(observation.observedAt),
    )
    const plan = planIntent(
      observation,
      state,
      'prepare-production-release',
    )

    const markup = renderToStaticMarkup(<IntentPlanPanel
      plan={plan}
      actionJob={null}
      actionBusy={false}
      inspectionBusy={false}
      actionFeedback={null}
      onRunAction={() => undefined}
      onRepairCompatibility={() => undefined}
    />)

    expect(markup).toContain('Prepare a production release')
    expect(markup).toContain('promote staging please')
    expect(markup).toContain('Conditional')
    expect(markup).toContain('Nothing displayed here is executed')
    expect(markup).not.toContain('<form')
  })

  it('renders the pinned workflow reference and runner boundaries', () => {
    const markup = renderToStaticMarkup(
      <ReferenceExplorer
        catalogue={referenceCatalogue()}
        onBack={() => undefined}
      />,
    )

    expect(markup).toContain('Triggers and guardrails')
    expect(markup).toContain('Checkpoint')
    expect(markup).toContain('checkpoint please')
    expect(markup).toContain('scripts/tctbp-run-checkpoint.js')
  })

  it('renders branch roles and active guardrails for a repository', () => {
    const observation = observationFixture({
      clean: false,
      syncState: 'behind',
    })
    const markup = renderToStaticMarkup(
      <RepositoryReferencePanel
        reference={repositoryReference(observation)}
      />,
    )

    expect(markup).toContain('Configured workflow path')
    expect(markup).toContain('development')
    expect(markup).toContain('staging')
    expect(markup).toContain('Dirty and behind')
  })
})
