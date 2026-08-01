import { describe, expect, it } from 'vitest'
import {
  hashFileContent,
  planManagedFileDrift,
} from './tctbp-drift'

describe('managed TCTBP file drift planning', () => {
  it('classifies current, missing, drifted, and unavailable source files', () => {
    const plan = planManagedFileDrift(
      [
        'scripts/current.js',
        'scripts/missing.js',
        'scripts/drifted.js',
        'scripts/unavailable.js',
      ],
      new Map([
        ['scripts/current.js', 'same'],
        ['scripts/missing.js', 'source'],
        ['scripts/drifted.js', 'source'],
      ]),
      new Map([
        ['scripts/current.js', 'same'],
        ['scripts/drifted.js', 'target'],
      ]),
    )

    expect(plan.files).toEqual([
      {
        path: 'scripts/current.js',
        state: 'current',
        sourceHash: hashFileContent('same'),
        targetHash: hashFileContent('same'),
      },
      {
        path: 'scripts/drifted.js',
        state: 'drifted',
        sourceHash: hashFileContent('source'),
        targetHash: hashFileContent('target'),
      },
      {
        path: 'scripts/missing.js',
        state: 'missing-target',
        sourceHash: hashFileContent('source'),
        targetHash: null,
      },
      {
        path: 'scripts/unavailable.js',
        state: 'source-unavailable',
        sourceHash: null,
        targetHash: null,
      },
    ])
    expect(plan.counts).toEqual({
      current: 1,
      'missing-target': 1,
      drifted: 1,
      'source-unavailable': 1,
    })
  })

  it('deduplicates and sorts managed paths without reporting unmanaged files', () => {
    const plan = planManagedFileDrift(
      ['b.js', 'a.js', 'b.js'],
      new Map([
        ['a.js', 'a'],
        ['b.js', 'b'],
      ]),
      new Map([
        ['a.js', 'a'],
        ['b.js', 'b'],
        ['unmanaged.js', 'ignored'],
      ]),
    )

    expect(plan.files.map((file) => file.path)).toEqual(['a.js', 'b.js'])
    expect(plan.counts).toEqual({
      current: 2,
      'missing-target': 0,
      drifted: 0,
      'source-unavailable': 0,
    })
  })
})
