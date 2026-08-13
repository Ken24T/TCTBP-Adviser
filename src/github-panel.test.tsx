import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { githubObservationFixture } from '../test/github-observation-fixture'
import { GitHubPanel } from './components/GitHubPanel'

describe('GitHub provider evidence panel', () => {
  it('shows provider state and the local-to-remote commit relationship', () => {
    const markup = renderToStaticMarkup(
      <GitHubPanel
        evidence={githubObservationFixture()}
        localBranch="development"
        localSha="abcdef1234567890"
        defaultOpen
      />,
    )

    expect(markup).toContain('GitHub-visible state')
    expect(markup).toContain('Ken24T/TCTBP-Adviser')
    expect(markup).toContain('development · abcdef1 · same commit')
    expect(markup).toContain('#9 Provider work')
    expect(markup).toContain('#12 Provider issue')
    expect(markup).toContain('latest v0.1.0')
    expect(markup).toContain('do not alter the deterministic recommendation')
  })

  it('collapses the provider state by default', () => {
    const markup = renderToStaticMarkup(
      <GitHubPanel
        evidence={githubObservationFixture()}
        localBranch="development"
        localSha="abcdef1234567890"
      />,
    )

    // Header stays visible; the evidence body is hidden until expanded.
    expect(markup).toContain('GitHub-visible state')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('Ken24T/TCTBP-Adviser')
  })

  it('hides the panel entirely when provider evidence is unavailable', () => {
    const markup = renderToStaticMarkup(
      <GitHubPanel evidence={{
        status: 'unavailable',
        basis: 'github-rest-api',
        retrievedAt: '2026-07-30T06:00:00.000Z',
        repository: { fullName: 'Ken24T/TCTBP-Adviser' },
        error: {
          code: 'github-access-denied',
          message: 'GitHub access was denied.',
        },
      }} />,
    )

    expect(markup).toBe('')
  })
})
