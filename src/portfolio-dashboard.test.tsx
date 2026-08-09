import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PortfolioSnapshot } from '../shared/portfolio'
import { PortfolioDashboard } from './components/PortfolioDashboard'
import { githubObservationFixture } from '../test/github-observation-fixture'

describe('portfolio dashboard', () => {
  it('shows compatible, non-TCTBP and renamed repositories', () => {
    const snapshot = portfolioFixture()
    const markup = renderToStaticMarkup(
      <PortfolioDashboard
        snapshot={snapshot}
        preferences={{
          ['A'.repeat(24)]: {
            pinned: true,
            hidden: false,
            name: 'Adviser Control Room',
          },
        }}
        query=""
        onOpen={() => undefined}
        onPreferenceChange={() => undefined}
      />,
    )

    expect(markup).toContain('Repository portfolio')
    expect(markup).toContain('Adviser Control Room')
    expect(markup).toContain('TCTBP-Adviser')
    expect(markup).toContain('TCTBP schema 11')
    expect(markup).toContain('TCTBP review')
    expect(markup).toContain('TCTBP review required')
    expect(markup).toContain('TCTBP blocked')
    expect(markup).toContain('Bootstrap required')
    expect(markup).toContain('Source outdated')
    expect(markup).toContain('Policy drift')
    expect(markup).toContain('Plain-Repo')
    expect(markup).toContain('TCTBP not installed')
    expect(markup).toContain('Install TCTBP')
    expect(markup).toContain('No Git fetch performed')
    expect(markup).toContain('flip-card-inner')
    expect(markup).toContain('Opening repository')
  })

  it('omits hidden repositories from the initial view', () => {
    const snapshot = portfolioFixture()
    const markup = renderToStaticMarkup(
      <PortfolioDashboard
        snapshot={snapshot}
        preferences={{
          ['B'.repeat(24)]: {
            pinned: false,
            hidden: true,
            name: '',
          },
        }}
        query=""
        onOpen={() => undefined}
        onPreferenceChange={() => undefined}
      />,
    )

    expect(markup).not.toContain('<h2>Plain-Repo</h2>')
    expect(markup).toContain('Show hidden (1)')
  })

  it('marks stale cache and unavailable repository state explicitly', () => {
    const snapshot = portfolioFixture()
    snapshot.cache.ageMs = 60_000
    snapshot.repositories.push({
      id: 'C'.repeat(24),
      name: 'Unavailable-Repo',
      source: 'local',
      available: false,
      observedAt: null,
      head: null,
      workingTree: null,
      localTracking: null,
      tctbp: null,
      recommendation: null,
      error: {
        code: 'inspection-failed',
        message: 'Local repository inspection failed safely.',
      },
      github: disabledGitHub(),
    })
    const markup = renderToStaticMarkup(
      <PortfolioDashboard
        snapshot={snapshot}
        preferences={{}}
        query=""
        onOpen={() => undefined}
        onPreferenceChange={() => undefined}
      />,
    )

    expect(markup).toContain('Stale portfolio')
    expect(markup).toContain('Unavailable-Repo')
    expect(markup).toContain('Inspection unavailable')
    expect(markup).toContain('Partial failure')
  })

  it('presents configured GitHub-only repositories without local advice', () => {
    const snapshot = portfolioFixture()
    snapshot.github.enabled = true
    snapshot.github.githubOnly = 1
    snapshot.repositories.push({
      id: 'G'.repeat(24),
      name: 'TCTBP-Adviser',
      source: 'github-only',
      available: true,
      observedAt: null,
      head: null,
      workingTree: null,
      localTracking: null,
      tctbp: null,
      recommendation: null,
      error: null,
      github: githubObservationFixture(),
    })

    const markup = renderToStaticMarkup(
      <PortfolioDashboard
        snapshot={snapshot}
        preferences={{}}
        query=""
        onOpen={() => undefined}
        onPreferenceChange={() => undefined}
      />,
    )

    expect(markup).toContain('1 GitHub-only repositories added')
    expect(markup).toContain('No local working copy')
    expect(markup).toContain('Local recommendation unavailable')
    expect(markup).toContain('View on GitHub')
  })
})

function portfolioFixture(): PortfolioSnapshot {
  return {
    generatedAt: '2026-07-30T05:00:00.000Z',
    cache: {
      status: 'refreshed',
      ageMs: 0,
      ttlMs: 30_000,
    },
    discovery: {
      scannedAt: '2026-07-30T05:00:00.000Z',
      repositoryCount: 2,
      rootCount: 1,
      issues: [],
    },
    github: {
      enabled: false,
      localMappings: 0,
      githubOnly: 0,
      unavailable: 0,
    },
    upgrade: {
      enabled: true,
      current: 0,
      reviewRequired: 1,
      bootstrapRequired: 0,
      blocked: 0,
      sourceUnavailable: 0,
    },
    repositories: [
      {
        id: 'A'.repeat(24),
        name: 'TCTBP-Adviser',
        source: 'local',
        available: true,
        observedAt: '2026-07-30T05:00:00.000Z',
        head: { branch: 'development', detached: false },
        workingTree: { clean: true, pathCount: 0 },
        localTracking: { state: 'in-sync', ahead: 0, behind: 0 },
        tctbp: { installed: true, compatible: true, schemaVersion: 11 },
        recommendation: {
          disposition: 'none',
          primaryAction: null,
          reasonCodes: ['no-action-required'],
          severity: 'healthy',
        },
        error: null,
        github: disabledGitHub(),
        upgrade: {
          disposition: 'review-required',
          sourceAlignment: 'outdated',
          actionCounts: { preserve: 1, add: 0, review: 1, unavailable: 0 },
          blockerCount: 0,
          policyDifferenceCount: 1,
          reasons: ['canonical source is newer', '1 policy difference(s)'],
        },
      },
      {
        id: 'B'.repeat(24),
        name: 'Plain-Repo',
        source: 'local',
        available: true,
        observedAt: '2026-07-30T05:00:00.000Z',
        head: { branch: 'main', detached: false },
        workingTree: { clean: true, pathCount: 0 },
        localTracking: { state: 'in-sync', ahead: 0, behind: 0 },
        tctbp: { installed: false, compatible: false, schemaVersion: null },
        recommendation: {
          disposition: 'stop',
          primaryAction: null,
          reasonCodes: ['tctbp-not-installed'],
          severity: 'stop',
        },
        error: null,
        github: disabledGitHub(),
      },
    ],
  }
}

function disabledGitHub() {
  return {
    status: 'disabled',
    basis: 'github-rest-api',
    retrievedAt: null,
  } as const
}
