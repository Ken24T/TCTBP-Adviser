import { describe, expect, it } from 'vitest'
import { observationFixture } from '../test/observation-fixture'
import {
  branchRoles,
  formatAge,
  formatEvidenceValue,
  syncSummary,
  workingTreeSummary,
} from './presentation'

describe('repository detail presentation', () => {
  it('summarises local tracking without implying a fetch', () => {
    expect(syncSummary(observationFixture())).toBe('In sync')
    expect(syncSummary(observationFixture({ syncState: 'ahead' })))
      .toBe('1 commit ahead')
    expect(syncSummary(observationFixture({ syncState: 'diverged' })))
      .toBe('1 ahead · 1 behind')
    expect(syncSummary(observationFixture({ syncState: 'unpublished' })))
      .toBe('No upstream branch')
  })

  it('summarises dirty working-tree counts', () => {
    expect(workingTreeSummary(observationFixture())).toBe('Clean')
    expect(workingTreeSummary(observationFixture({ clean: false })))
      .toBe('1 staged')
    expect(workingTreeSummary(observationFixture({
      clean: false,
      conflicted: 2,
    }))).toBe('1 staged · 2 conflicted')
  })

  it('formats freshness and evidence values consistently', () => {
    expect(formatAge(0)).toBe('Observed just now')
    expect(formatAge(12_500)).toBe('Observed 12 s ago')
    expect(formatAge(120_000)).toBe('Observed 2 min ago')
    expect(formatAge(null)).toBe('Unknown age')
    expect(formatEvidenceValue(['merge', 'rebase'])).toBe('merge, rebase')
    expect(formatEvidenceValue([])).toBe('None')
    expect(formatEvidenceValue(false)).toBe('No')
  })

  it('omits branch roles that are not configured', () => {
    expect(branchRoles({
      strategy: 'simple',
      workingBranch: null,
      preProductionBranch: null,
      productionBranch: 'main',
      promotionTargets: [],
    })).toEqual([{ role: 'Production', branch: 'main' }])
  })
})
