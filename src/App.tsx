import { useEffect, useRef, useState } from 'react'
import { useTheme } from './theme'
import { ErrorBanner } from './components/ErrorBanner'
import { LoadingState } from './components/LoadingState'
import { TopNav } from './components/TopNav'
import type { ActionerJob, ActionerWorkflowId } from '../shared/actioner'
import type { AiReviewResult } from '../shared/ai-review'
import type {
  TctbpBootstrapJob,
  TctbpBootstrapPlan,
  TctbpBootstrapRequest,
} from '../shared/tctbp-bootstrap'
import type { PortfolioSnapshot } from '../shared/portfolio'
import type { RecommendationIntent } from '../shared/recommendation'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import type { ReferenceCatalogue } from '../shared/reference'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import {
  loadPortfolio,
  loadReferenceCatalogue,
  loadActionerJob,
  loadTctbpBootstrapJob,
  startTctbpBootstrap,
  loadRepositoryDetail,
  loadTctbpUpgradePlan,
  loadTctbpBootstrapReview,
  loadTctbpUpgradeReview,
  prepareTctbpBootstrap,
  refreshRepositoryOnServer,
} from './api'
import { intentForRecommendation } from './recommended-intent'
import { PortfolioDashboard } from './components/PortfolioDashboard'
import { RepositoryDetail } from './components/RepositoryDetail'
import { ReferenceExplorer } from './components/ReferenceExplorer'
import { SettingsPanel } from './components/SettingsPanel'
import { PortfolioDashboardSkeleton } from './components/PortfolioDashboardSkeleton'
import { usePortfolioPreferences } from './use-portfolio-preferences'
import { useWorkflowActions } from './use-workflow-actions'
import { useUpgradeApply } from './use-upgrade-apply'

// File-size note: under 600 lines — above the 400-line warning threshold but below the 600-line hard split.
// App.tsx is the application shell: it owns the shared state machine (~25 useState/useRef) and the
// view routing. The presentational layers are already extracted (TopNav, ErrorBanner, LoadingState,
// and the view components), workflow-action confirmation/start maps live in action-workflows.ts, the
// shared view reset lives in resetSession(), the portfolio-preferences state (hydration from the
// shared server file plus debounced saves) lives in use-portfolio-preferences.ts, the workflow
// action runner (runAction / runRecommendedAction) lives in use-workflow-actions.ts, and the
// upgrade apply handlers (applyAdditions / applyPolicy / applyDeleteObsolete / applyInOrder) live
// in use-upgrade-apply.ts. Splitting further means extracting the remaining coupled async handlers
// into a custom hook (e.g. useAdviser), deferred as a larger, riskier refactor.
function App() {
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null)
  const [detail, setDetail] = useState<RepositoryDetailResult | null>(null)
  const [actionJob, setActionJob] = useState<ActionerJob | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [upgradePlan, setUpgradePlan] = useState<TctbpUpgradePlan | null>(null)
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [applyBusy, setApplyBusy] = useState(false)
  const [upgradeFeedback, setUpgradeFeedback] = useState<string | null>(null)
  const [aiReview, setAiReview] = useState<AiReviewResult | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiAcknowledged, setAiAcknowledged] = useState(false)
  const [bootstrapPlan, setBootstrapPlan] = useState<TctbpBootstrapPlan | null>(null)
  const [bootstrapBusy, setBootstrapBusy] = useState(false)
  const [bootstrapApplyBusy, setBootstrapApplyBusy] = useState(false)
  const [bootstrapApplyFeedback, setBootstrapApplyFeedback] = useState<string | null>(null)
  const [bootstrapJob, setBootstrapJob] = useState<TctbpBootstrapJob | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [catalogue, setCatalogue] = useState<ReferenceCatalogue | null>(null)
  const [intent, setIntent] = useState<RecommendationIntent>('none')
  const [query, setQuery] = useState('')
  const { changePreference, preferences } = usePortfolioPreferences(
    (cause) => captureError(cause, requestId.current),
  )
  const [busy, setBusy] = useState(true)
  const [refreshingRepositoryId, setRefreshingRepositoryId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const started = useRef(false)
  const mutatedRef = useRef(false)
  const returningIdRef = useRef<string | null>(null)
  const { runAction, runRecommendedAction, addOrigin, createOrigin } = useWorkflowActions({
    detail,
    intent,
    refreshDetail,
    reportError: (cause) => captureError(cause, requestId.current),
    selectedId,
    setActionBusy,
    setActionFeedback,
    setActionJob,
    setError,
    setIntent,
  })

  useEffect(() => {
    if (
      !selectedId
      || !bootstrapJob
      || bootstrapJob.status === 'completed'
      || bootstrapJob.status === 'failed'
    ) return
    const timer = window.setTimeout(() => {
      void loadTctbpBootstrapJob(selectedId, bootstrapJob.jobId)
        .then(async (nextJob) => {
          setBootstrapJob(nextJob)
          if (nextJob.status === 'completed') {
            mutatedRef.current = true
            setBootstrapApplyBusy(false)
            setBootstrapApplyFeedback(
              `Bootstrap completed on ${nextJob.result?.branch ?? 'the dedicated branch'} with ${nextJob.result?.appliedPaths.length ?? 0} file(s). Review and checkpoint before publishing.`,
            )
            await refreshDetail(selectedId, intent)
            // The bootstrap changes the working tree — refresh the upgrade
            // plan too so the panel never shows a stale plan. Run it only
            // after the detail refresh has settled: both share
            // requestId.current, so starting them concurrently makes
            // refreshUpgradePlan invalidate refreshDetail's result — the
            // detail stays stale and its busy flag never clears.
            if (upgradePlan) await refreshUpgradePlan(selectedId)
          } else if (nextJob.status === 'failed') {
            setBootstrapApplyBusy(false)
            setBootstrapApplyFeedback(nextJob.error ?? 'Bootstrap failed before completion.')
          }
        })
        .catch((cause) => captureError(cause, requestId.current))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [bootstrapJob, intent, selectedId, upgradePlan])

  useEffect(() => {
    if (
      !selectedId
      || !actionJob
      || actionJob.status === 'completed'
      || actionJob.status === 'failed'
    ) return
    const timer = window.setTimeout(() => {
      void loadActionerJob(selectedId, actionJob.jobId)
        .then(async (nextJob) => {
          setActionJob(nextJob)
          if (nextJob.status === 'completed' || nextJob.status === 'failed') {
            if (nextJob.status === 'completed') mutatedRef.current = true
            setActionBusy(false)
            const refreshed = await refreshDetail(selectedId, intent)
            if (!refreshed) {
              setActionFeedback(
                `${nextJob.workflowId} completed, but the Adviser could not refresh repository state. Refresh manually before continuing.`,
              )
            }
            // Checkpoint/publish/apply change the repository state — refresh
            // the upgrade plan so it never shows a stale plan after an
            // action. Run it only after the detail refresh has settled:
            // both share requestId.current, so starting them concurrently
            // makes refreshUpgradePlan invalidate refreshDetail's result —
            // the detail stays stale and its busy flag never clears.
            if (nextJob.status === 'completed' && upgradePlan) {
              await refreshUpgradePlan(selectedId)
            }
          }
        })
        .catch((cause) => captureError(cause, requestId.current))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [actionJob, intent, selectedId, upgradePlan])

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

  async function refreshRepositoryCard(repositoryId: string): Promise<void> {
    const currentRequest = ++requestId.current
    setBusy(true)
    setRefreshingRepositoryId(repositoryId)
    setError(null)
    try {
      const nextPortfolio = await refreshRepositoryOnServer(repositoryId)
      if (currentRequest === requestId.current) setPortfolio(nextPortfolio)
    } catch (cause) {
      captureError(cause, currentRequest)
    } finally {
      if (currentRequest === requestId.current) {
        setBusy(false)
        setRefreshingRepositoryId(null)
      }
    }
  }

  async function refreshDetail(
    repositoryId: string,
    selectedIntent: RecommendationIntent,
  ): Promise<RepositoryDetailResult | null> {
    const currentRequest = ++requestId.current
    setBusy(true)
    setError(null)
    try {
      const nextDetail = await loadRepositoryDetail(
        repositoryId,
        selectedIntent,
      )
      if (currentRequest === requestId.current) setDetail(nextDetail)
      return nextDetail
    } catch (cause) {
      captureError(cause, currentRequest)
      return null
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
      if (currentRequest === requestId.current) {
        setUpgradePlan(nextPlan)
        setAiReview(null)
        setAiAcknowledged(false)
      }
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
      const nextReview = bootstrapPlan?.request
        ? await loadTctbpBootstrapReview(selectedId, bootstrapPlan.request)
        : await loadTctbpUpgradeReview(selectedId)
      setAiReview(nextReview)
      setAiAcknowledged(false)
    } catch (cause) {
      captureError(cause, requestId.current)
    } finally {
      setAiBusy(false)
    }
  }

  async function prepareBootstrap(request: TctbpBootstrapRequest): Promise<void> {
    if (!selectedId) return
    setBootstrapBusy(true)
    setAiReview(null)
    setError(null)
    try {
      setBootstrapPlan(await prepareTctbpBootstrap(selectedId, request))
    } catch (cause) {
      captureError(cause, requestId.current)
    } finally {
      setBootstrapBusy(false)
    }
  }

  async function applyBootstrap(request: TctbpBootstrapRequest): Promise<void> {
    if (!selectedId || !bootstrapPlan?.fingerprint || aiReview?.status !== 'available') return
    if (!window.confirm(
      'Create the bootstrap branch and install canonical TCTBP infrastructure? No commit or push will be performed.',
    )) return
    setBootstrapApplyBusy(true)
    setBootstrapApplyFeedback(null)
    setError(null)
    try {
      const startedJob = await startTctbpBootstrap(
        selectedId,
        bootstrapPlan.fingerprint,
        aiReview.reviewId,
        request,
      )
      setBootstrapJob({
        jobId: startedJob.jobId,
        repositoryId: selectedId,
        status: 'queued',
        steps: [],
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      })
      setBootstrapApplyFeedback('Bootstrap job started. Showing live progress…')
    } catch (cause) {
      captureError(cause, requestId.current)
    } finally {
      setBootstrapApplyBusy(false)
    }
  }

  const {
    applyAdditions,
    applyPolicy,
    applyDrifted,
    applyAlignment,
    applyDeleteObsolete,
    applyInOrder,
    cleanupUpgradeBranch,
    mergeUpgradeBranch,
  } = useUpgradeApply({
    selectedId,
    upgradePlan,
    aiReview,
    intent,
    refreshDetail,
    refreshUpgradePlan,
    setApplyBusy,
    setUpgradeFeedback,
    setError,
    markMutated: () => {
      mutatedRef.current = true
    },
    reportError: (cause) => captureError(cause, requestId.current),
  })

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
    returningIdRef.current = repositoryId
    setReferenceOpen(false)
    setSelectedId(repositoryId)
    setDetail(null)
    setUpgradePlan(null)
    setUpgradeBusy(false)
    setApplyBusy(false)
    setUpgradeFeedback(null)
    setAiReview(null)
    setAiBusy(false)
    setAiAcknowledged(false)
    setBootstrapPlan(null)
    setBootstrapBusy(false)
    setBootstrapApplyBusy(false)
    setBootstrapApplyFeedback(null)
    setBootstrapJob(null)
    setActionJob(null)
    setActionBusy(false)
    setActionFeedback(null)
    setIntent('none')
    void (async () => {
      const nextDetail = await refreshDetail(repositoryId, 'none')
      const suggestedIntent = intentForRecommendation(
        nextDetail?.recommendation.primaryAction ?? null,
      )
      if (suggestedIntent) {
        setIntent(suggestedIntent)
        await refreshDetail(repositoryId, suggestedIntent)
      }
    })()
  }

  function resetSession(): void {
    setSelectedId(null)
    setDetail(null)
    setUpgradePlan(null)
    setUpgradeBusy(false)
    setApplyBusy(false)
    setUpgradeFeedback(null)
    setAiReview(null)
    setAiBusy(false)
    setAiAcknowledged(false)
    setBootstrapPlan(null)
    setBootstrapBusy(false)
    setBootstrapApplyBusy(false)
    setBootstrapApplyFeedback(null)
    setBootstrapJob(null)
    setActionJob(null)
    setActionBusy(false)
    setActionFeedback(null)
    setIntent('none')
  }

  function showPortfolio(): void {
    requestId.current += 1
    resetSession()
    setReferenceOpen(false)
    setSettingsOpen(false)
    setBusy(false)
    setError(null)
    if (returningIdRef.current) {
      const returning = returningIdRef.current
      window.setTimeout(() => {
        if (returningIdRef.current === returning) returningIdRef.current = null
      }, 1200)
    }
    if (mutatedRef.current) {
      mutatedRef.current = false
      void refreshPortfolio()
    }
  }

  function showReference(): void {
    requestId.current += 1
    resetSession()
    returningIdRef.current = null
    setSettingsOpen(false)
    setReferenceOpen(true)
    setError(null)
    if (!catalogue) void refreshCatalogue()
    else setBusy(false)
  }

  function showSettings(): void {
    requestId.current += 1
    resetSession()
    returningIdRef.current = null
    setReferenceOpen(false)
    setSettingsOpen(true)
    setBusy(false)
    setError(null)
  }

  function changeIntent(nextIntent: RecommendationIntent): void {
    if (!selectedId) return
    setIntent(nextIntent)
    void refreshDetail(selectedId, nextIntent)
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void refreshPortfolio()
  }, [])

  const retry = () => {
    if (referenceOpen) void refreshCatalogue()
    else if (selectedId) void refreshDetail(selectedId, intent)
    else void refreshPortfolio(true)
  }

  const { resolved } = useTheme()

  return (
    <div className={`min-h-screen flex flex-col ${resolved}`}>
      <TopNav
        busy={busy}
        onQueryChange={setQuery}
        onRefresh={() => void refreshPortfolio(true)}
        onShowPortfolio={showPortfolio}
        onShowReference={showReference}
        onShowSettings={showSettings}
        query={query}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        {error && <ErrorBanner error={error} onRetry={retry} />}

        {settingsOpen ? (
          <SettingsPanel
            onBack={showPortfolio}
            onPreferenceChange={changePreference}
            onSaved={() => void refreshPortfolio(true)}
            preferences={preferences}
            repositories={portfolio?.repositories ?? []}
          />
        ) : referenceOpen && catalogue ? (
          <ReferenceExplorer catalogue={catalogue} onBack={showPortfolio} />
        ) : selectedId && detail ? (
          <RepositoryDetail
            detail={detail}
            preferences={preferences}
            actionJob={actionJob}
            actionBusy={actionBusy}
            actionFeedback={actionFeedback}
            onRunAction={(workflowId) => void runAction(workflowId)}
            onAddOrigin={(url) => void addOrigin(url)}
            onCreateOrigin={(name, visibility) => void createOrigin(name, visibility)}
            onRunRecommended={() => void runRecommendedAction()}
            onRepairCompatibility={() => void runAction('repair-tctbp-script-compatibility')}
            intent={intent}
            busy={busy}
            upgradePlan={upgradePlan}
            upgradeBusy={upgradeBusy}
            applyBusy={applyBusy}
            upgradeFeedback={upgradeFeedback}
            aiReview={aiReview}
            aiBusy={aiBusy}
            aiAcknowledged={aiAcknowledged}
            onAiAcknowledgedChange={setAiAcknowledged}
            bootstrapPlan={bootstrapPlan}
            bootstrapBusy={bootstrapBusy}
            bootstrapApplyBusy={bootstrapApplyBusy}
            bootstrapApplyFeedback={bootstrapApplyFeedback}
            bootstrapJob={bootstrapJob}
            onPrepareBootstrap={(request) => void prepareBootstrap(request)}
            onApplyBootstrap={(request) => void applyBootstrap(request)}
            onBack={showPortfolio}
            onIntentChange={changeIntent}
            onRefresh={() => void refreshDetail(selectedId, intent)}
            onLoadUpgradePlan={() => void refreshUpgradePlan(selectedId)}
            onReviewAi={() => void refreshAiReview()}
            onApplyAdditions={() => void applyAdditions()}
            onApplyPolicy={() => void applyPolicy()}
            onApplyDrifted={() => void applyDrifted()}
            onApplyAlignment={() => void applyAlignment()}
            onDeleteObsolete={() => void applyDeleteObsolete()}
            onApplyInOrder={() => void applyInOrder()}
            onCleanupUpgradeBranch={() => void cleanupUpgradeBranch()}
            onMergeUpgradeBranch={() => void mergeUpgradeBranch()}
          />
        ) : !referenceOpen && !selectedId && portfolio ? (
          <PortfolioDashboard
            busy={busy}
            refreshingRepositoryId={refreshingRepositoryId}
            returningId={returningIdRef.current}
            snapshot={portfolio}
            preferences={preferences}
            query={query}
            onOpen={openRepository}
            onPreferenceChange={changePreference}
            onRefreshRepository={(repositoryId) => (
              void refreshRepositoryCard(repositoryId)
            )}
          />
        ) : !error ? (
          referenceOpen
            ? <LoadingState message="Loading the pinned TCTBP reference…" />
            : selectedId
              ? <LoadingState message="Inspecting the selected repository…" />
              : <PortfolioDashboardSkeleton />
        ) : null}
      </main>

      <footer className="py-8 text-center text-xs text-text-faint uppercase tracking-widest">
        Local evidence remains primary · No Git fetch · No repository mutation
      </footer>
    </div>
  )
}

export default App
