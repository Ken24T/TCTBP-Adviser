import { describe, expect, it } from 'vitest'
import { intentForRecommendation } from './recommended-intent'

describe('recommendation intent mapping', () => {
  it('maps clear deterministic workflow recommendations', () => {
    expect(intentForRecommendation('checkpoint')).toBe('preserve-locally')
    expect(intentForRecommendation('publish')).toBe('preserve-and-publish')
    expect(intentForRecommendation('resume')).toBe('resume-after-machine-change')
    expect(intentForRecommendation('handover')).toBe('continue-on-another-machine')
  })

  it('leaves ambiguous or diagnostic recommendations neutral', () => {
    expect(intentForRecommendation('refresh-inspection')).toBeNull()
    expect(intentForRecommendation('install-tctbp')).toBeNull()
    expect(intentForRecommendation(null)).toBeNull()
  })
})
