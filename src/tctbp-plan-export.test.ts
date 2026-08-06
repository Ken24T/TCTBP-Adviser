import { describe, expect, it } from 'vitest'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import {
  createTctbpPlanDocument,
  formatTctbpPlanJson,
  formatTctbpPlanMarkdown,
} from './tctbp-plan-export'

const plan: TctbpUpgradePlan = {
  disposition: 'review-required',
  sourceAlignment: 'outdated',
  actionCounts: { preserve: 1, add: 1, review: 1, unavailable: 0 },
  blockers: [],
  source: {
    state: 'available',
    repository: 'TCTBP-Web',
    revision: 'a'.repeat(40),
    version: '0.3.0',
    managedFileCount: 3,
    message: null,
  },
  target: {
    sourceRepository: 'Ken24T/TCTBP-Web',
    sourceRevision: 'b'.repeat(40),
    sourceVersion: '0.2.0',
  },
  drift: {
    files: [
      {
        path: 'scripts/current.js',
        state: 'current',
        action: 'preserve',
        sourceHash: 'same',
        targetHash: 'same',
      },
      {
        path: 'scripts/add.js',
        state: 'missing-target',
        action: 'add',
        sourceHash: 'source',
        targetHash: null,
      },
      {
        path: 'scripts/review.js',
        state: 'drifted',
        action: 'review',
        sourceHash: 'source',
        targetHash: 'target',
      },
    ],
    counts: {
      current: 1,
      'missing-target': 1,
      drifted: 1,
      'source-unavailable': 0,
    },
  },
  policy: {
    state: 'drifted',
    differences: [{ area: 'hardening', message: 'Candidate guard is missing.' }],
  },
}

describe('TCTBP plan export', () => {
  it('creates deterministic JSON and Markdown documents', () => {
    const document = createTctbpPlanDocument(
      'example-repository',
      plan,
      '2026-08-01T00:00:00.000Z',
    )
    const json = formatTctbpPlanJson(document)
    const markdown = formatTctbpPlanMarkdown(document)

    expect(JSON.parse(json)).toEqual(document)
    expect(markdown).toContain('# TCTBP upgrade plan: example-repository')
    expect(markdown).toContain('Generated: 2026-08-01T00:00:00.000Z')
    expect(markdown).toContain('- add: `scripts/add.js`')
    expect(markdown).toContain('- review: `scripts/review.js`')
    expect(markdown).not.toContain('scripts/current.js')
    expect(markdown).toContain('hardening: Candidate guard is missing.')
    expect(markdown).toContain('No repository changes were applied.')
  })
})
