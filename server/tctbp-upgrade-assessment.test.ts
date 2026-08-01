import { describe, expect, it } from 'vitest'
import type {
  TctbpPolicyComparison,
  TctbpUpgradePlan,
} from '../shared/tctbp-upgrade'
import { assessTctbpUpgrade } from './tctbp-upgrade-assessment'

const source = {
  state: 'available',
  repository: 'TCTBP-Web',
  revision: 'a'.repeat(40),
  version: '0.3.0',
  managedFileCount: 1,
  message: null,
} as const

const target: TctbpUpgradePlan['target'] = {
  sourceRepository: 'Ken24T/TCTBP-Web',
  sourceRevision: source.revision,
  sourceVersion: '0.3.0',
}

const alignedPolicy: TctbpPolicyComparison = {
  state: 'aligned',
  differences: [],
}

describe('TCTBP upgrade assessment', () => {
  it('marks a clean aligned target as current', () => {
    const assessment = assessTctbpUpgrade({
      source,
      target,
      drift: drift({ current: 1 }),
      policy: alignedPolicy,
      targetState: {
        detached: false,
        operationCount: 0,
        workingTreeClean: true,
        environmentBranch: false,
      },
    })

    expect(assessment).toEqual({
      disposition: 'current',
      sourceAlignment: 'current',
      actionCounts: {
        preserve: 1,
        add: 0,
        review: 0,
        unavailable: 0,
      },
      blockers: [],
    })
  })

  it('reports safety blockers separately from review work', () => {
    const assessment = assessTctbpUpgrade({
      source,
      target: { ...target, sourceRepository: 'Other/TCTBP' },
      drift: drift({ review: 1 }),
      policy: alignedPolicy,
      targetState: {
        detached: true,
        operationCount: 1,
        workingTreeClean: false,
        environmentBranch: true,
      },
    })

    expect(assessment.disposition).toBe('review-required')
    expect(assessment.sourceAlignment).toBe('different-source')
    expect(assessment.actionCounts.review).toBe(1)
    expect(assessment.blockers.map((blocker) => blocker.code)).toEqual([
      'different-source',
      'working-tree-dirty',
      'active-git-operation',
      'detached-head',
      'environment-branch',
    ])
  })
})

function drift(overrides: Partial<Record<'current' | 'review', number>>) {
  const files = []
  for (let index = 0; index < (overrides.current ?? 0); index += 1) {
    files.push({
      path: `current-${index}.js`,
      state: 'current' as const,
      action: 'preserve' as const,
      sourceHash: null,
      targetHash: null,
    })
  }
  for (let index = 0; index < (overrides.review ?? 0); index += 1) {
    files.push({
      path: `review-${index}.js`,
      state: 'drifted' as const,
      action: 'review' as const,
      sourceHash: null,
      targetHash: null,
    })
  }
  return {
    files,
    counts: {
      current: overrides.current ?? 0,
      'missing-target': 0,
      drifted: overrides.review ?? 0,
      'source-unavailable': 0,
    },
  }
}
