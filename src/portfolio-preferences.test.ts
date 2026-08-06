import { describe, expect, it } from 'vitest'
import {
  normalisePreferences,
  updatePortfolioPreference,
} from './portfolio-preferences'

describe('portfolio preferences', () => {
  it('keeps only bounded preferences for opaque repository IDs', () => {
    const id = 'A'.repeat(24)
    expect(normalisePreferences({
      [id]: { pinned: true, hidden: false, name: 'Adviser' },
      '../path': { pinned: true, hidden: true, name: 'Unsafe key' },
    })).toEqual({
      [id]: { pinned: true, hidden: false, name: 'Adviser' },
    })
  })

  it('updates one preference without altering other repositories', () => {
    const first = 'A'.repeat(24)
    const second = 'B'.repeat(24)
    const updated = updatePortfolioPreference({
      [second]: { pinned: false, hidden: false, name: 'Second' },
    }, first, {
      pinned: true,
      name: 'A'.repeat(100),
    })

    expect(updated[first]).toMatchObject({
      pinned: true,
      hidden: false,
    })
    expect(updated[first].name).toHaveLength(80)
    expect(updated[second].name).toBe('Second')
  })
})
