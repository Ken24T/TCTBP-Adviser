import type { AiReviewResult } from '../shared/ai-review'

export class AiReviewStore {
  readonly #reviews = new Map<string, AiReviewResult>()

  constructor(readonly capacity = 100) {}

  put(review: AiReviewResult): void {
    if (review.status !== 'available') return
    this.#reviews.set(review.reviewId, review)
    while (this.#reviews.size > this.capacity) {
      const oldest = this.#reviews.keys().next().value
      if (typeof oldest !== 'string') break
      this.#reviews.delete(oldest)
    }
  }

  get(reviewId: string): AiReviewResult | null {
    return this.#reviews.get(reviewId) ?? null
  }
}
