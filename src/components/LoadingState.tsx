export function LoadingState({ message }: { message: string }) {
  return (
    <section
      aria-live="polite"
      className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-text-muted"
    >
      <span
        aria-hidden="true"
        className="w-10 h-10 border-[3px] border-ink-200 border-t-teal-500 rounded-full animate-spin"
      />
      <p className="text-sm">{message}</p>
    </section>
  )
}
