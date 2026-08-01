import { describe, expect, it } from 'vitest'
import type { PortfolioRepository } from '../shared/portfolio'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import {
  summarizePortfolioUpgrades,
  summarizeUpgradePlan,
} from './tctbp-portfolio'

const plan: TctbpUpgradePlan = {
  disposition: 'review-required',
  sourceAlignment: 'outdated',
  actionCounts: { preserve: 2, add: 1, review: 3, unavailable: 0 },
  blockers: [{ code: 'different-source', message: 'Different source.' }],
  source: {
    state: 'available',
    repository: 'TCTBP-Web',
    revision: 'a'.repeat(40),
    version: '0.3.0',
    managedFileCount: 6,
    message: null,
  },
  target: {
    sourceRepository: 'Other/TCTBP',
    sourceRevision: 'b'.repeat(40),
    sourceVersion: '0.2.0',
  },
  drift: {
    files: [],
    counts: {
      current: 2,
      'missing-target': 1,
      drifted: 3,
      'source-unavailable': 0,
    },
  },
  policy: {
    state: 'drifted',
    differences: [{ area: 'hardening', message: 'Missing.' }],
  },
}

describe('portfolio TCTBP upgrade summaries', () => {
  it('reduces a plan to safe portfolio-level signals', () => {
    expect(summarizeUpgradePlan(plan)).toEqual({
      disposition: 'review-required',
      sourceAlignment: 'outdated',
      actionCounts: { preserve: 2, add: 1, review: 3, unavailable: 0 },
      blockerCount: 1,
      policyDifferenceCount: 1,
    })
  })

  it('counts current, review, and unavailable local repositories', () => {
    const repositories = [
      repository('current', 'current'),
      repository('review', 'review-required'),
      repository('unavailable', 'source-unavailable'),
      { ...repository('github', 'current'), source: 'github-only' as const },
    ]

    expect(summarizePortfolioUpgrades(repositories)).toEqual({
      enabled: true,
      current: 1,
      reviewRequired: 1,
      sourceUnavailable: 1,
    })
  })
})

function repository(
  name: string,
  disposition: TctbpUpgradePlan['disposition'],
): PortfolioRepository {
  return {
    id: name,
    name,
    source: 'local',
    available: true,
    observedAt: null,
    head: null,
    workingTree: null,
    localTracking: null,
    tctbp: null,
    recommendation: null,
    error: null,
    github: { status: 'disabled', basis: 'github-rest-api', retrievedAt: null },
    upgrade: {
      disposition,
      sourceAlignment: 'current',
      actionCounts: { preserve: 1, add: 0, review: 0, unavailable: 0 },
      blockerCount: 0,
      policyDifferenceCount: 0,
    },
  }
}
