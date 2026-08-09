import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PortfolioRepository } from '../shared/portfolio'
import { CardCallout } from './components/CardCallout'

describe('card callout', () => {
  const repository: PortfolioRepository = {
    id: 'A'.repeat(24),
    name: 'TCTBP-Adviser',
    source: 'local',
    available: true,
    observedAt: '2026-07-30T01:00:00.000Z',
    head: { branch: 'development', detached: false },
    workingTree: { clean: false, pathCount: 2 },
    localTracking: { state: 'ahead', ahead: 3, behind: 0 },
    tctbp: { installed: true, compatible: true, schemaVersion: 11 },
    recommendation: {
      disposition: 'action',
      primaryAction: 'checkpoint',
      reasonCodes: ['working-tree-dirty-and-behind'],
      severity: 'attention',
    },
    error: null,
    github: {
      status: 'disabled',
      basis: 'github-rest-api',
      retrievedAt: null,
    },
    upgrade: {
      disposition: 'review-required',
      sourceAlignment: 'outdated',
      actionCounts: { preserve: 1, add: 0, review: 1, unavailable: 0 },
      blockerCount: 0,
      policyDifferenceCount: 1,
      reasons: ['canonical source is newer'],
    },
  }

  it('renders nothing while hidden', () => {
    const markup = renderToStaticMarkup(
      <CardCallout repository={repository} visible={false} />,
    )
    expect(markup).toBe('')
  })

  it('surfaces the recommendation, state, and observation when visible', () => {
    const markup = renderToStaticMarkup(
      <CardCallout repository={repository} visible />,
    )

    expect(markup).toContain('Recommended')
    expect(markup).toContain('Checkpoint')
    expect(markup).toContain('Local work exists on a behind branch')
    expect(markup).toContain('Sync')
    expect(markup).toContain('3 commits ahead')
    expect(markup).toContain('Working tree')
    expect(markup).toContain('2 changed')
    expect(markup).toContain('TCTBP')
    expect(markup).toContain('Installed · schema 11')
    expect(markup).toContain('Upgrade')
    expect(markup).toContain('TCTBP review required')
    expect(markup).toContain('canonical source is newer')
    expect(markup).toContain('Observed')
  })
})
