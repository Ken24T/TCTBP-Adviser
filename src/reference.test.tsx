import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { observationFixture } from '../test/observation-fixture'
import { repositoryReference, referenceCatalogue } from '../server/reference/catalogue'
import type { IntentPlan } from '../shared/intent'
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
    />)

    expect(markup).toContain('Prepare a production release')
    expect(markup).toContain('promote staging please')
    expect(markup).toContain('Conditional')
    expect(markup).toContain('Nothing displayed here is executed')
    expect(markup).not.toContain('<form')
  })

  it('offers a how-to-resolve hint for each blocker on a blocked plan', () => {
    const plan = {
      source: 'user-intent',
      fingerprint: 'fingerprint',
      intent: 'preserve-locally',
      status: 'blocked',
      title: 'Blocked plan',
      summary: 'The plan is blocked.',
      steps: [],
      likelyNextStepId: null,
      blockedBy: [
        { code: 'working-tree-dirty', message: 'Working tree is dirty.' },
        { code: 'detached-head', message: 'HEAD is detached.' },
        { code: 'unknown-blocker', message: 'Mystery blocker.' },
      ],
      evidence: [],
      branchStrategy: null,
      effects: { does: [], doesNot: [] },
    } satisfies IntentPlan

    const markup = renderToStaticMarkup(<IntentPlanPanel
      plan={plan}
      actionJob={null}
      actionBusy={false}
      inspectionBusy={false}
      actionFeedback={null}
      onRunAction={() => undefined}
    />)

    expect(markup).toContain('Resolve state or policy first')
    expect(markup).toContain('Working tree is dirty.')
    expect(markup).toContain('How to resolve: Commit or stash local changes first — or checkpoint them.')
    expect(markup).toContain('How to resolve: Reattach to a branch first (e.g. git switch development).')
    // Unknown blocker codes get no hint.
    expect(markup).toContain('Mystery blocker.')
    expect(markup).not.toContain('How to resolve: Mystery blocker.')
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

  it('renders branch roles and applicable workflows for a repository', () => {
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
    expect(markup).toContain('Applicable workflows')
  })
})
