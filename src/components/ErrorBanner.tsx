import { Button } from './primitives'

export function ErrorBanner({
  error,
  onRetry,
}: {
  error: string
  onRetry: () => void
}) {
  return (
    <section
      role="alert"
      className="ad-surface p-8 border-l-4 border-red-500 flex items-end justify-between gap-8"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-red-600">Inspection unavailable</p>
        <h1 className="mt-1 text-3xl font-semibold text-text-primary">The Adviser stopped safely.</h1>
        <p className="mt-2 text-text-secondary max-w-2xl">{error}</p>
      </div>
      <Button variant="primary" onClick={onRetry}>
        Try again
      </Button>
    </section>
  )
}
