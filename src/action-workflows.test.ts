import { describe, expect, it } from 'vitest'
import { workflowForRecommendation } from './action-workflows'

describe('workflowForRecommendation', () => {
  it('maps actionable recommendations to their workflows', () => {
    expect(workflowForRecommendation('checkpoint')).toBe('checkpoint')
    expect(workflowForRecommendation('publish')).toBe('publish')
    expect(workflowForRecommendation('resume')).toBe('resume')
    expect(workflowForRecommendation('handover')).toBe('handover')
  })

  it('returns null for recommendations without a direct workflow', () => {
    expect(workflowForRecommendation('install-tctbp')).toBeNull()
    expect(workflowForRecommendation('review-compatibility')).toBeNull()
    expect(workflowForRecommendation('reattach-branch')).toBeNull()
    expect(workflowForRecommendation(null)).toBeNull()
  })
})
