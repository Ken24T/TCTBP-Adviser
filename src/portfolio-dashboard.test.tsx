import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PortfolioSnapshot } from '../shared/portfolio'
import { PortfolioDashboard } from './components/PortfolioDashboard'

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
        busy={false}
        onOpen={() => undefined}
        onRefresh={() => undefined}
        onPreferenceChange={() => undefined}
      />,
    )

    expect(markup).toContain('Repository portfolio')
    expect(markup).toContain('Adviser Control Room')
    expect(markup).toContain('TCTBP-Adviser')
    expect(markup).toContain('TCTBP schema 11')
    expect(markup).toContain('Plain-Repo')
    expect(markup).toContain('TCTBP not installed')
    expect(markup).toContain('Install TCTBP')
    expect(markup).toContain('No fetch performed')
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
        busy={false}
        onOpen={() => undefined}
        onRefresh={() => undefined}
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
    })
    const markup = renderToStaticMarkup(
      <PortfolioDashboard
        snapshot={snapshot}
        preferences={{}}
        busy={false}
        onOpen={() => undefined}
        onRefresh={() => undefined}
        onPreferenceChange={() => undefined}
      />,
    )

    expect(markup).toContain('Stale portfolio')
    expect(markup).toContain('Unavailable-Repo')
    expect(markup).toContain('Inspection unavailable')
    expect(markup).toContain('Partial failure')
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
    repositories: [
      {
        id: 'A'.repeat(24),
        name: 'TCTBP-Adviser',
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
      },
      {
        id: 'B'.repeat(24),
        name: 'Plain-Repo',
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
      },
    ],
  }
}
