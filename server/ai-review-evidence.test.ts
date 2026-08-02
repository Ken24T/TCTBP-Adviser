import { describe, expect, it } from 'vitest'
import { buildUpgradeReviewEvidence } from './ai-review-evidence'
import type { RepositoryObservation } from '../shared/inspection'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'

const observation = {
  repository: { id: 'opaque', name: 'example' },
  observedAt: '2026-08-01T00:00:00.000Z',
  basis: 'local-working-copy-and-local-tracking-refs',
  fetchPerformed: false,
  head: {
    branch: 'feature/upgrade', detached: false, unborn: false, sha: 'a'.repeat(40),
  },
} as RepositoryObservation

const plan = {
  fingerprint: 'b'.repeat(64),
  disposition: 'review-required',
  sourceAlignment: 'outdated',
  source: {
    state: 'available', repository: 'TCTBP-Web', version: '0.3.0',
    revision: 'c'.repeat(40), managedFileCount: 1, message: null,
  },
  target: {
    branch: 'feature/upgrade', headSha: 'a'.repeat(40),
    sourceRepository: 'Ken24T/TCTBP-Web', sourceRevision: 'd'.repeat(40), sourceVersion: '0.2.0',
  },
  actionCounts: { preserve: 0, add: 0, review: 1, unavailable: 0 },
  blockers: [],
  policy: { state: 'aligned', differences: [] },
  drift: {
    files: [{
      path: 'scripts/tctbp-core.js', state: 'drifted', action: 'review',
      sourceHash: 'source', targetHash: 'target',
    }],
    counts: { current: 0, 'missing-target': 0, drifted: 1, 'source-unavailable': 0 },
  },
} as TctbpUpgradePlan

describe('AI upgrade evidence', () => {
  it('contains bounded structured plan evidence without paths or commands', () => {
    const evidence = buildUpgradeReviewEvidence('example', observation, plan)

    expect(evidence).toMatchObject({
      evidenceVersion: 1,
      repositoryName: 'example',
      planFingerprint: plan.fingerprint,
      sourceAlignment: 'outdated',
      files: [{ path: 'scripts/tctbp-core.js', action: 'review' }],
      truncated: false,
    })
    expect(JSON.stringify(evidence)).not.toContain('/home/')
    expect(JSON.stringify(evidence)).not.toContain('npm')
  })
})
