import { describe, expect, it } from 'vitest'
import { AiReviewStore } from './ai-review-store'
import type { AiReviewResult } from '../shared/ai-review'

function review(id: string): AiReviewResult {
  return {
    status: 'available',
    reviewId: id,
    reviewedAt: '2026-08-03T00:00:00.000Z',
    provider: 'openai-compatible',
    model: 'test-model',
    planFingerprint: 'a'.repeat(64),
    summary: 'Review',
    risks: [],
    recommendedNextStep: 'Review',
    confidence: 'medium',
    unknowns: [],
    error: null,
  }
}

describe('AI review store', () => {
  it('retains successful reviews and evicts oldest entries', () => {
    const store = new AiReviewStore(1)
    store.put(review('first'))
    store.put(review('second'))

    expect(store.get('first')).toBeNull()
    expect(store.get('second')).not.toBeNull()
  })
})
