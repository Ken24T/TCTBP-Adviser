import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { observationFixture } from '../test/observation-fixture'
import { repositoryReference, referenceCatalogue } from '../server/reference/catalogue'
import type { IntentPlan } from '../shared/intent'
import { actionConfirmation } from './action-workflows'
import { IntentPlanPanel } from './components/IntentPlanPanel'
import {
  filterWorkflows,
  ReferenceExplorer,
} from './components/ReferenceExplorer'
import { RepositoryReferencePanel } from './components/RepositoryReferencePanel'
import { planIntent } from '../server/intents/planner'
import { recommend } from '../server/recommendations/engine'

describe('intent and reference views', () => {
  it('builds branch-aware ship and promote confirmation prompts', () => {
    const model = {
      strategy: 'simple',
      workingBranch: 'master',
      preProductionBranch: null,
      productionBranch: 'master',
      promotionTargets: [],
    }

    expect(actionConfirmation('ship', model)).toContain('Ship a release from master?')
    expect(actionConfirmation('ship', null)).toContain('Ship a release from main?')

    const staged = {
      strategy: 'staged',
      workingBranch: 'development',
      preProductionBranch: 'staging',
      productionBranch: 'main',
      promotionTargets: ['staging', 'production'],
    }
    expect(actionConfirmation('promote-review', staged)).toContain('into staging?')
    expect(actionConfirmation('promote-production', staged)).toContain('into main?')
  })

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

  it('renders a staged-model promote action button with the pre-production branch name', () => {
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
      'prepare-pre-production',
    )

    const markup = renderToStaticMarkup(<IntentPlanPanel
      plan={plan}
      actionJob={null}
      actionBusy={false}
      inspectionBusy={false}
      actionFeedback={null}
      onRunAction={() => undefined}
    />)

    // The staged model's pre-production branch is "staging" (not "review") —
    // the promote action button must render with that branch's label.
    expect(markup).toContain('Promote staging')
    expect(markup).toContain('promote staging please')
  })

  it('omits a step button when the Take action bar owns that workflow', () => {
    const observation = observationFixture({ clean: false })
    const state = recommend(
      observation,
      'none',
      new Date(observation.observedAt),
    )
    const plan = planIntent(observation, state, 'preserve-locally')
    if (!plan) throw new Error('expected a preserve-locally plan')

    // Sanity: the preserve-locally plan includes a required checkpoint step.
    expect(plan.steps.some(
      (step) => step.workflowId === 'checkpoint' && step.condition === 'required',
    )).toBe(true)

    // The bar owns checkpoint, so the step renders its sequence info but no
    // duplicate "Run checkpoint" button at all.
    const markup = renderToStaticMarkup(<IntentPlanPanel
      plan={plan}
      actionJob={null}
      actionBusy={false}
      inspectionBusy={false}
      actionFeedback={null}
      onRunAction={() => undefined}
      primaryAction="checkpoint"
    />)
    expect(markup).toContain('Preserves tracked and untracked work in a local commit.')
    expect(markup).toContain('checkpoint please')
    expect(markup).not.toContain('Run checkpoint')
    expect(markup).not.toContain('Run from the Take action bar above.')

    // Without the bar owning the action the step button renders enabled.
    const enabled = renderToStaticMarkup(<IntentPlanPanel
      plan={plan}
      actionJob={null}
      actionBusy={false}
      inspectionBusy={false}
      actionFeedback={null}
      onRunAction={() => undefined}
      primaryAction={null}
    />)
    expect(enabled).toContain('Run checkpoint')
    expect(enabled).not.toContain('disabled=""')
  })

  it('adds an explanation callout trigger to actionable steps', () => {
    const observation = observationFixture({ clean: false })
    const state = recommend(
      observation,
      'none',
      new Date(observation.observedAt),
    )
    const plan = planIntent(observation, state, 'preserve-locally')
    if (!plan) throw new Error('expected a preserve-locally plan')

    const markup = renderToStaticMarkup(<IntentPlanPanel
      plan={plan}
      actionJob={null}
      actionBusy={false}
      inspectionBusy={false}
      actionFeedback={null}
      onRunAction={() => undefined}
      primaryAction={null}
      reasonCodes={['working-tree-dirty']}
    />)

    // The actionable step gets an info trigger; the callout content itself is
    // hidden until opened (hover/focus/click), so the reason text stays out of
    // the static markup.
    expect(markup).toContain('Why Checkpoint')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('The working tree contains uncommitted work')
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

    expect(markup).toContain('TCTBP surface reference')
    expect(markup).toContain('Checkpoint')
    expect(markup).toContain('checkpoint please')
    // Filter controls are present in workflows mode.
    expect(markup).toContain('Surface')
    expect(markup).toContain('Family')
    // Chat-invokable workflows carry a "Chat trigger" badge; automated
    // sub-steps (gate) are marked "Automated step".
    expect(markup).toContain('Chat trigger')
    expect(markup).toContain('Automated step')
    // Technical detail (runner, preconditions, effects) is collapsed behind
    // each card's toggle rather than sprawled across the page.
    expect(markup).toContain('Show details')
    expect(markup).not.toContain('scripts/tctbp-run-checkpoint.js')
    // The runner is still carried by the catalogue data.
    expect(
      referenceCatalogue().workflows.find((workflow) => workflow.id === 'checkpoint')
        ?.runner,
    ).toBe('scripts/tctbp-run-checkpoint.js')
    // The catalogue marks orient as chat-invokable and gate as automated.
    expect(
      referenceCatalogue().workflows.find((workflow) => workflow.id === 'orient')
        ?.chatInvokable,
    ).toBe(true)
    expect(
      referenceCatalogue().workflows.find((workflow) => workflow.id === 'gate')
        ?.chatInvokable,
    ).toBe(false)
  })

  it('filters workflows by surface, family, and search together', () => {
    const workflows = referenceCatalogue().workflows

    expect(filterWorkflows(workflows, '', 'all', 'all')).toHaveLength(19)

    const chat = filterWorkflows(workflows, '', 'chat', 'all')
    expect(chat.some((workflow) => workflow.id === 'orient')).toBe(true)
    expect(chat.some((workflow) => workflow.id === 'gate')).toBe(false)

    const automated = filterWorkflows(workflows, '', 'automated', 'all')
    expect(automated.map((workflow) => workflow.id)).toEqual(['gate'])

    const environment = filterWorkflows(workflows, '', 'all', 'environment')
    expect(environment.length).toBeGreaterThan(0)
    expect(environment.every(
      (workflow) => workflow.category === 'environment',
    )).toBe(true)

    // Search and filters combine: "promote" within chat triggers.
    expect(
      filterWorkflows(workflows, 'promote', 'chat', 'all')
        .map((workflow) => workflow.id),
    ).toEqual(['promote'])
  })

  it('renders branch roles and applicable workflows for a repository', () => {
    const observation = observationFixture({
      clean: false,
      syncState: 'behind',
    })
    const markup = renderToStaticMarkup(
      <RepositoryReferencePanel
        reference={repositoryReference(observation)}
        defaultOpen
      />,
    )

    expect(markup).toContain('Configured workflow path')
    expect(markup).toContain('development')
    expect(markup).toContain('staging')
    expect(markup).toContain('Applicable workflows')
    expect(markup).toContain('Inspect repository health without fetching or changing it.')
    expect(markup).toContain('Preserve current work in a local commit.')
    expect(markup).toContain('Workflows you can run on this branch, based on the advertised policy.')
  })

  it('collapses the workflow reference by default', () => {
    const observation = observationFixture({
      clean: false,
      syncState: 'behind',
    })
    const markup = renderToStaticMarkup(
      <RepositoryReferencePanel reference={repositoryReference(observation)} />,
    )

    expect(markup).toContain('Configured workflow path')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('Applicable workflows')
  })

  it('shows an empty state when no workflows are applicable', () => {
    const markup = renderToStaticMarkup(
      <RepositoryReferencePanel
        reference={repositoryReference(
          observationFixture({ workflows: [], clean: false, syncState: 'behind' }),
        )}
        defaultOpen
      />,
    )

    expect(markup).toContain('No workflows are applicable on this branch.')
  })
})
