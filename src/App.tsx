import { useEffect, useRef, useState } from 'react'
import type { AiReviewResult } from '../shared/ai-review'
import type { TctbpBootstrapPlan, TctbpBootstrapRequest } from '../shared/tctbp-bootstrap'
import type { PortfolioSnapshot } from '../shared/portfolio'
import type { RecommendationIntent } from '../shared/recommendation'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import type { ReferenceCatalogue } from '../shared/reference'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import {
  loadPortfolio,
  loadReferenceCatalogue,
  applyTctbpUpgradePlan,
  loadRepositoryDetail,
  loadTctbpUpgradePlan,
  loadTctbpUpgradeReview,
  prepareTctbpBootstrap,
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
  const [applyBusy, setApplyBusy] = useState(false)
  const [upgradeFeedback, setUpgradeFeedback] = useState<string | null>(null)
  const [aiReview, setAiReview] = useState<AiReviewResult | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [bootstrapPlan, setBootstrapPlan] = useState<TctbpBootstrapPlan | null>(null)
  const [bootstrapBusy, setBootstrapBusy] = useState(false)
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
    setUpgradeFeedback(null)
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

  async function refreshAiReview(): Promise<void> {
    if (!selectedId) return
    setAiBusy(true)
    setError(null)
    try {
      setAiReview(await loadTctbpUpgradeReview(selectedId))
    } catch (cause) {
      captureError(cause, requestId.current)
    } finally {
      setAiBusy(false)
    }
  }

  async function prepareBootstrap(request: TctbpBootstrapRequest): Promise<void> {
    if (!selectedId) return
    setBootstrapBusy(true)
    setError(null)
    try {
      setBootstrapPlan(await prepareTctbpBootstrap(selectedId, request))
    } catch (cause) {
      captureError(cause, requestId.current)
    } finally {
      setBootstrapBusy(false)
    }
  }

  async function applyUpgrade(
    mode: Parameters<typeof applyTctbpUpgradePlan>[2],
    approvedPaths: string[],
    approvedDeletionPaths: string[],
    confirmDeletions: boolean,
    confirmation: string,
  ): Promise<void> {
    if (!selectedId || !upgradePlan?.fingerprint) return
    if (!window.confirm(confirmation)) return
    setApplyBusy(true)
    setUpgradeFeedback(null)
    setError(null)
    try {
      const result = await applyTctbpUpgradePlan(
        selectedId,
        upgradePlan.fingerprint,
        mode,
        approvedPaths,
        approvedDeletionPaths,
        confirmDeletions,
      )
      setUpgradeFeedback(
        result.status === 'applied'
          ? `Applied ${result.appliedPaths.length} change(s). Review and checkpoint the repository next.`
          : 'There were no approved changes to apply.',
      )
      await refreshDetail(selectedId, intent)
      await refreshUpgradePlan(selectedId)
    } catch (cause) {
      captureError(cause, requestId.current)
    } finally {
      setApplyBusy(false)
    }
  }

  function applyUpgradeAdditions(): Promise<void> {
    return applyUpgrade(
      'additions-only',
      [],
      [],
      false,
      'Apply missing canonical TCTBP files? No commit or push will be performed.',
    )
  }

  function applyUpgradePolicy(): Promise<void> {
    return applyUpgrade(
      'approved-managed-files',
      ['.github/TCTBP.json'],
      [],
      false,
      'Merge canonical TCTBP infrastructure policy sections? No commit or push will be performed.',
    )
  }

  function deleteObsoleteUpgradeFiles(): Promise<void> {
    const paths = upgradePlan?.drift.obsoleteTargets?.map((file) => file.path) ?? []
    return applyUpgrade(
      'approved-managed-files',
      [],
      paths,
      true,
      `Delete ${paths.length} obsolete canonical TCTBP file(s)? This cannot be undone by the Adviser.`,
    )
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
    setApplyBusy(false)
    setUpgradeFeedback(null)
    setAiReview(null)
    setAiBusy(false)
    setBootstrapPlan(null)
    setBootstrapBusy(false)
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
    setApplyBusy(false)
    setUpgradeFeedback(null)
    setAiReview(null)
    setAiBusy(false)
    setBootstrapPlan(null)
    setBootstrapBusy(false)
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
    setApplyBusy(false)
    setUpgradeFeedback(null)
    setAiReview(null)
    setAiBusy(false)
    setBootstrapPlan(null)
    setBootstrapBusy(false)
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
            applyBusy={applyBusy}
            upgradeFeedback={upgradeFeedback}
            aiReview={aiReview}
            aiBusy={aiBusy}
            bootstrapPlan={bootstrapPlan}
            bootstrapBusy={bootstrapBusy}
            onPrepareBootstrap={(request) => void prepareBootstrap(request)}
            onBack={showPortfolio}
            onIntentChange={changeIntent}
            onRefresh={() => void refreshDetail(selectedId, intent)}
            onLoadUpgradePlan={() => void refreshUpgradePlan(selectedId)}
            onReviewAi={() => void refreshAiReview()}
            onApplyAdditions={() => void applyUpgradeAdditions()}
            onApplyPolicy={() => void applyUpgradePolicy()}
            onDeleteObsolete={() => void deleteObsoleteUpgradeFiles()}
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
