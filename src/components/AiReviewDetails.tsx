import type { AiReviewResult } from '../../shared/ai-review'

export function AiReviewDetails({ review }: { review: AiReviewResult }) {
  const tone = review.status === 'available' ? 'success'
    : review.status === 'invalid' || review.status === 'unavailable' ? 'warning'
    : 'neutral'
  return (
    <section className="mb-4 p-4 bg-surface-soft border border-border rounded-lg" aria-label="Jasper AI review">
      <strong className={`block text-sm font-semibold ${
        tone === 'success' ? 'text-teal-900'
        : tone === 'warning' ? 'text-amber-900'
        : 'text-text-primary'
      }`}>
        {aiReviewLabel(review.status)}
      </strong>
      {review.summary && <p className="mt-1 text-sm text-text-secondary">{review.summary}</p>}
      {review.risks.length > 0 && (
        <ul className="mt-2 space-y-2 text-sm">
          {review.risks.map((risk) => (
            <li key={risk.message} className="p-2 bg-surface-elevated border border-border rounded">
              {risk.message}
              {risk.evidenceRefs.length > 0 && (
                <small className="block mt-1 text-text-faint"> Evidence: {risk.evidenceRefs.join(', ')}</small>
              )}
              {risk.evidenceRefs.length === 0 && (
                <small className="block mt-1 text-text-faint"> Evidence reference unavailable</small>
              )}
            </li>
          ))}
        </ul>
      )}
      {review.recommendedNextStep && (
        <p className="mt-2 text-sm"><strong>Next step:</strong> {review.recommendedNextStep}</p>
      )}
      {review.error && <p className="mt-2 p-2 bg-red-50 text-red-900 rounded text-sm">{review.error}</p>}
    </section>
  )
}

function aiReviewLabel(status: AiReviewResult['status']): string {
  if (status === 'available') return 'Jasper review — advisory only'
  if (status === 'disabled') return 'Jasper review is not configured'
  if (status === 'invalid') return 'Jasper returned an invalid review'
  return 'Jasper review is unavailable'
}
