import { useEffect, useRef, useState } from 'react'
import type { PortfolioSnapshot } from '../shared/portfolio'
import type { RecommendationIntent } from '../shared/recommendation'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import {
  loadPortfolio,
  loadRepositoryDetail,
} from './api-client'
import { PortfolioDashboard } from './components/PortfolioDashboard'
import { RepositoryDetail } from './components/RepositoryDetail'
import {
  loadPortfolioPreferences,
  savePortfolioPreferences,
  updatePortfolioPreference,
  type PortfolioPreference,
  type PortfolioPreferences,
} from './portfolio-preferences'

function App() {
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null)
  const [detail, setDetail] = useState<RepositoryDetailResult | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [intent, setIntent] = useState<RecommendationIntent>('none')
  const [preferences, setPreferences] = useState<PortfolioPreferences>(
    loadPortfolioPreferences,
  )
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const started = useRef(false)

  async function refreshPortfolio(force = false): Promise<void> {
    const currentRequest = ++requestId.current
    setBusy(true)
    setError(null)
    try {
      const nextPortfolio = await loadPortfolio(force)
      if (currentRequest === requestId.current) setPortfolio(nextPortfolio)
    } catch (cause) {
      captureError(cause, currentRequest)
    } finally {
      if (currentRequest === requestId.current) setBusy(false)
    }
  }

  async function refreshDetail(
    repositoryId: string,
    selectedIntent: RecommendationIntent,
  ): Promise<void> {
    const currentRequest = ++requestId.current
    setBusy(true)
    setError(null)
    try {
      const nextDetail = await loadRepositoryDetail(
        repositoryId,
        selectedIntent,
      )
      if (currentRequest === requestId.current) setDetail(nextDetail)
    } catch (cause) {
      captureError(cause, currentRequest)
    } finally {
      if (currentRequest === requestId.current) setBusy(false)
    }
  }

  function captureError(cause: unknown, currentRequest: number): void {
    if (currentRequest !== requestId.current) return
    setError(
      cause instanceof Error
        ? cause.message
        : 'The repository inspection failed safely.',
    )
  }

  function openRepository(repositoryId: string): void {
    setSelectedId(repositoryId)
    setDetail(null)
    setIntent('none')
    void refreshDetail(repositoryId, 'none')
  }

  function showPortfolio(): void {
    requestId.current += 1
    setSelectedId(null)
    setDetail(null)
    setIntent('none')
    setBusy(false)
    setError(null)
  }

  function changeIntent(nextIntent: RecommendationIntent): void {
    if (!selectedId) return
    setIntent(nextIntent)
    void refreshDetail(selectedId, nextIntent)
  }

  function changePreference(
    repositoryId: string,
    patch: Partial<PortfolioPreference>,
  ): void {
    setPreferences((current) => (
      updatePortfolioPreference(current, repositoryId, patch)
    ))
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void refreshPortfolio()
  }, [])

  useEffect(() => {
    savePortfolioPreferences(preferences)
  }, [preferences])

  const retry = () => {
    if (selectedId) void refreshDetail(selectedId, intent)
    else void refreshPortfolio(true)
  }

  return (
    <div className="app-shell">
      <nav className="topbar" aria-label="Application">
        <button
          className="brand"
          type="button"
          aria-label="Show repository portfolio"
          onClick={showPortfolio}
        >
          <span className="brand-mark" aria-hidden="true">T</span>
          <span>
            <strong>TCTBP</strong>
            <small>Adviser</small>
          </span>
        </button>
        <span className="mode-label">Local repository portfolio</span>
      </nav>

      <main>
        {error && (
          <section className="error-panel" role="alert">
            <div>
              <p className="eyebrow">Inspection unavailable</p>
              <h1>The Adviser stopped safely.</h1>
              <p>{error}</p>
            </div>
            <button type="button" onClick={retry}>
              Try again
            </button>
          </section>
        )}

        {selectedId && detail ? (
          <RepositoryDetail
            detail={detail}
            intent={intent}
            busy={busy}
            onBack={showPortfolio}
            onIntentChange={changeIntent}
            onRefresh={() => void refreshDetail(selectedId, intent)}
          />
        ) : !selectedId && portfolio ? (
          <PortfolioDashboard
            snapshot={portfolio}
            preferences={preferences}
            busy={busy}
            onOpen={openRepository}
            onRefresh={() => void refreshPortfolio(true)}
            onPreferenceChange={changePreference}
          />
        ) : !error ? (
          <section className="loading-panel" aria-live="polite">
            <span className="loading-ring" aria-hidden="true" />
            <p>
              {selectedId
                ? 'Inspecting the selected repository…'
                : 'Discovering local repositories…'}
            </p>
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
