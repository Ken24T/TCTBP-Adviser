import { useEffect, useRef, useState } from 'react'
import type { PortfolioSnapshot } from '../shared/portfolio'
import type { RecommendationIntent } from '../shared/recommendation'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import type { ReferenceCatalogue } from '../shared/reference'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import {
  loadPortfolio,
  loadReferenceCatalogue,
  loadRepositoryDetail,
  loadTctbpUpgradePlan,
} from './api-client'
import { PortfolioDashboard } from './components/PortfolioDashboard'
import { RepositoryDetail } from './components/RepositoryDetail'
import { ReferenceExplorer } from './components/ReferenceExplorer'
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
  const [upgradePlan, setUpgradePlan] = useState<TctbpUpgradePlan | null>(null)
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [catalogue, setCatalogue] = useState<ReferenceCatalogue | null>(null)
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

  async function refreshUpgradePlan(repositoryId: string): Promise<void> {
    const currentRequest = ++requestId.current
    setUpgradeBusy(true)
    setError(null)
    try {
      const nextPlan = await loadTctbpUpgradePlan(repositoryId)
      if (currentRequest === requestId.current) setUpgradePlan(nextPlan)
    } catch (cause) {
      captureError(cause, currentRequest)
    } finally {
      if (currentRequest === requestId.current) setUpgradeBusy(false)
    }
  }

  async function refreshCatalogue(): Promise<void> {
    const currentRequest = ++requestId.current
    setBusy(true)
    setError(null)
    try {
      const nextCatalogue = await loadReferenceCatalogue()
      if (currentRequest === requestId.current) setCatalogue(nextCatalogue)
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
    setReferenceOpen(false)
    setSelectedId(repositoryId)
    setDetail(null)
    setUpgradePlan(null)
    setUpgradeBusy(false)
    setIntent('none')
    void refreshDetail(repositoryId, 'none')
  }

  function showPortfolio(): void {
    requestId.current += 1
    setSelectedId(null)
    setReferenceOpen(false)
    setDetail(null)
    setUpgradePlan(null)
    setUpgradeBusy(false)
    setIntent('none')
    setBusy(false)
    setError(null)
  }

  function showReference(): void {
    requestId.current += 1
    setSelectedId(null)
    setDetail(null)
    setUpgradePlan(null)
    setUpgradeBusy(false)
    setIntent('none')
    setReferenceOpen(true)
    setError(null)
    if (!catalogue) void refreshCatalogue()
    else setBusy(false)
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
    if (referenceOpen) void refreshCatalogue()
    else if (selectedId) void refreshDetail(selectedId, intent)
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
        <div className="topbar-actions">
          <button type="button" onClick={showReference}>TCTBP reference</button>
          <span className="mode-label">Local-first repository portfolio</span>
        </div>
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

        {referenceOpen && catalogue ? (
          <ReferenceExplorer catalogue={catalogue} onBack={showPortfolio} />
        ) : selectedId && detail ? (
          <RepositoryDetail
            detail={detail}
            intent={intent}
            busy={busy}
            upgradePlan={upgradePlan}
            upgradeBusy={upgradeBusy}
            onBack={showPortfolio}
            onIntentChange={changeIntent}
            onRefresh={() => void refreshDetail(selectedId, intent)}
            onLoadUpgradePlan={() => void refreshUpgradePlan(selectedId)}
          />
        ) : !referenceOpen && !selectedId && portfolio ? (
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
              {referenceOpen
                ? 'Loading the pinned TCTBP reference…'
                : selectedId
                ? 'Inspecting the selected repository…'
                : 'Discovering local repositories…'}
            </p>
          </section>
        ) : null}
      </main>

      <footer>
        Local evidence remains primary · No Git fetch · No repository mutation
      </footer>
    </div>
  )
}

export default App
