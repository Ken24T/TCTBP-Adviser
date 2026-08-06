import { describe, expect, it } from 'vitest'
import { parsePorcelainV2 } from './git-status'

describe('porcelain v2 parser', () => {
  it('classifies branch sync and working-tree counts', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head development',
      '# branch.upstream origin/development',
      '# branch.ab +2 -1',
      '1 MM N... 100644 100644 100644 a a tracked.txt',
      '? untracked.txt',
      'u UU N... 100644 100644 100644 100644 a b c conflicted.txt',
    ].join('\0')

    expect(parsePorcelainV2(output)).toMatchObject({
      branch: 'development',
      detached: false,
      unborn: false,
      sha: 'abc123',
      pathCount: 3,
      counts: {
        staged: 1,
        modified: 1,
        untracked: 1,
        conflicted: 1,
      },
      tracking: {
        upstream: 'origin/development',
        available: true,
        ahead: 2,
        behind: 1,
        state: 'diverged',
      },
    })
  })

  it.each([
    ['+0 -0', 'in-sync'],
    ['+1 -0', 'ahead'],
    ['+0 -1', 'behind'],
    ['+1 -1', 'diverged'],
  ])('maps branch.ab %s to %s', (branchAb, expected) => {
    const output = [
      '# branch.oid abc123',
      '# branch.head development',
      '# branch.upstream origin/development',
      `# branch.ab ${branchAb}`,
    ].join('\0')
    expect(parsePorcelainV2(output).tracking.state).toBe(expected)
  })

  it('recognises detached and unborn repositories safely', () => {
    const detached = [
      '# branch.oid abc123',
      '# branch.head (detached)',
    ].join('\0')
    const unborn = [
      '# branch.oid (initial)',
      '# branch.head development',
    ].join('\0')

    expect(parsePorcelainV2(detached)).toMatchObject({
      branch: null,
      detached: true,
      unborn: false,
    })
    expect(parsePorcelainV2(unborn)).toMatchObject({
      branch: 'development',
      detached: false,
      unborn: true,
      sha: null,
    })
  })

  it('counts a rename once and ignores its second path record', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head development',
      '2 R. N... 100644 100644 100644 a b R100 renamed.txt',
      'original.txt',
    ].join('\0')

    expect(parsePorcelainV2(output)).toMatchObject({
      pathCount: 1,
      counts: {
        staged: 1,
        modified: 0,
        untracked: 0,
        conflicted: 0,
      },
    })
  })
})
