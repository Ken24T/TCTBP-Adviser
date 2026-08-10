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
        tctbpInstalled: true,
        targetPolicyAvailable: true,
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

  it('classifies a repository without usable TCTBP as bootstrap-required', () => {
    const assessment = assessTctbpUpgrade({
      source,
      target,
      drift: drift({ add: 1 }),
      policy: { state: 'unavailable', differences: [] },
      targetState: {
        detached: false,
        operationCount: 0,
        workingTreeClean: true,
        environmentBranch: false,
        tctbpInstalled: false,
        targetPolicyAvailable: false,
      },
    })

    expect(assessment.disposition).toBe('bootstrap-required')
  })

  it('does not block when only the environment branch constrains the apply', () => {
    const assessment = assessTctbpUpgrade({
      source,
      target,
      drift: drift({ current: 1 }),
      policy: alignedPolicy,
      targetState: {
        detached: false,
        operationCount: 0,
        workingTreeClean: true,
        environmentBranch: true,
        tctbpInstalled: true,
        targetPolicyAvailable: true,
      },
    })

    expect(assessment.disposition).toBe('current')
    expect(assessment.sourceAlignment).toBe('current')
    // Being on an environment branch is no longer a blocker: the apply step
    // creates a dedicated upgrade branch automatically.
    expect(assessment.blockers).toEqual([])
  })

  it('treats the canonical source repo itself as current when HEAD equals the source revision', () => {
    // The canonical source repo has no .tctbp/source.json (it is the origin,
    // not a consumer), so its target source record is empty. Its HEAD SHA
    // equals the canonical revision, which means its managed surface is the
    // source surface — it must not recommend "Update TCTBP" for itself.
    const assessment = assessTctbpUpgrade({
      source,
      target: {
        sourceRepository: null,
        sourceRevision: null,
        sourceVersion: null,
        headSha: source.revision,
      },
      drift: drift({ current: 1 }),
      policy: alignedPolicy,
      targetState: {
        detached: false,
        operationCount: 0,
        workingTreeClean: true,
        environmentBranch: false,
        tctbpInstalled: true,
        targetPolicyAvailable: true,
      },
    })

    expect(assessment.sourceAlignment).toBe('current')
    expect(assessment.disposition).toBe('current')
    expect(assessment.blockers).toEqual([])
  })

  it('keeps review-required on an environment branch when work exists', () => {
    const assessment = assessTctbpUpgrade({
      source,
      target: { ...target, sourceRevision: 'b'.repeat(40) },
      drift: drift({ review: 1 }),
      policy: alignedPolicy,
      targetState: {
        detached: false,
        operationCount: 0,
        workingTreeClean: true,
        environmentBranch: true,
        tctbpInstalled: true,
        targetPolicyAvailable: true,
      },
    })

    expect(assessment.disposition).toBe('review-required')
    expect(assessment.sourceAlignment).toBe('outdated')
  })

  it('prefers a recorded source revision over a matching HEAD when aligning', () => {
    // A target that records an older source revision is outdated even when its
    // HEAD SHA happens to equal the canonical revision (e.g. a consumer whose
    // fixture commits coincide) — the recorded revision is the source of truth.
    const assessment = assessTctbpUpgrade({
      source,
      target: {
        ...target,
        sourceRevision: 'b'.repeat(40),
        headSha: source.revision,
      },
      drift: drift({ current: 1, review: 1 }),
      policy: alignedPolicy,
      targetState: {
        detached: false,
        operationCount: 0,
        workingTreeClean: true,
        environmentBranch: false,
        tctbpInstalled: true,
        targetPolicyAvailable: true,
      },
    })

    expect(assessment.sourceAlignment).toBe('outdated')
    expect(assessment.disposition).toBe('review-required')
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
        tctbpInstalled: true,
        targetPolicyAvailable: true,
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
    ])
  })
})

function drift(overrides: Partial<Record<'current' | 'review' | 'add', number>>) {
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
  for (let index = 0; index < (overrides.add ?? 0); index += 1) {
    files.push({
      path: `add-${index}.js`,
      state: 'missing-target' as const,
      action: 'add' as const,
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
      'missing-target': overrides.add ?? 0,
      drifted: overrides.review ?? 0,
      'source-unavailable': 0,
    },
  }
}
