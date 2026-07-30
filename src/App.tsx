import { useEffect, useRef, useState } from 'react'
import type { RecommendationIntent } from '../shared/recommendation'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import { loadRepositoryDetail } from './api-client'
import { RepositoryDetail } from './components/RepositoryDetail'

function App() {
  const [detail, setDetail] = useState<RepositoryDetailResult | null>(null)
  const [intent, setIntent] = useState<RecommendationIntent>('none')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const started = useRef(false)

  async function refresh(selectedIntent: RecommendationIntent): Promise<void> {
    const currentRequest = ++requestId.current
    setBusy(true)
    setError(null)
    try {
      const nextDetail = await loadRepositoryDetail(selectedIntent)
      if (currentRequest === requestId.current) setDetail(nextDetail)
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'The repository inspection failed safely.',
        )
      }
    } finally {
      if (currentRequest === requestId.current) setBusy(false)
    }
  }

  function changeIntent(nextIntent: RecommendationIntent): void {
    setIntent(nextIntent)
    void refresh(nextIntent)
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void refresh('none')
  }, [])

  return (
    <div className="app-shell">
      <nav className="topbar" aria-label="Application">
        <a className="brand" href="/" aria-label="TCTBP Adviser home">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span>
            <strong>TCTBP</strong>
            <small>Adviser</small>
          </span>
        </a>
        <span className="mode-label">Single-repository local MVP</span>
      </nav>

      <main>
        {error && (
          <section className="error-panel" role="alert">
            <div>
              <p className="eyebrow">Inspection unavailable</p>
              <h1>The Adviser stopped safely.</h1>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => void refresh(intent)}>
              Try again
            </button>
          </section>
        )}

        {detail ? (
          <RepositoryDetail
            detail={detail}
            intent={intent}
            busy={busy}
            onIntentChange={changeIntent}
            onRefresh={() => void refresh(intent)}
          />
        ) : !error ? (
          <section className="loading-panel" aria-live="polite">
            <span className="loading-ring" aria-hidden="true" />
            <p>Inspecting the configured repository…</p>
          </section>
        ) : null}
      </main>

      <footer>
        Local observations only · No fetch · No repository mutation
      </footer>
    </div>
  )
}

export default App
