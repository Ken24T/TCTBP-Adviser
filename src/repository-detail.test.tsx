import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { recommend } from '../server/recommendations/engine'
import { observationFixture } from '../test/observation-fixture'
import { RepositoryDetail } from './components/RepositoryDetail'

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
        detail={{ observation, recommendation, github: disabledGitHub() }}
        intent="none"
        busy={false}
        onIntentChange={() => undefined}
        onRefresh={() => undefined}
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
  })

  it('renders the explicit machine-transfer intent path', () => {
    const observation = observationFixture()
    const recommendation = recommend(
      observation,
      'continue-on-another-machine',
      new Date(observation.observedAt),
    )
    const markup = renderToStaticMarkup(
      <RepositoryDetail
        detail={{ observation, recommendation, github: disabledGitHub() }}
        intent="continue-on-another-machine"
        busy={false}
        onIntentChange={() => undefined}
        onRefresh={() => undefined}
      />,
    )

    expect(markup).toContain('Handover')
    expect(markup).toContain('handover please')
    expect(markup).toContain('Continue on another machine')
  })
})

function disabledGitHub() {
  return {
    status: 'disabled',
    basis: 'github-rest-api',
    retrievedAt: null,
  } as const
}
