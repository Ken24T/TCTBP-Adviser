import { useEffect, useRef, useState } from 'react'
import { Button } from './components/primitives'
import { useTheme } from './theme'
import { ThemeToggle } from './components/ThemeToggle'
import type { ActionerJob, ActionerJobStart, ActionerWorkflowId } from '../shared/actioner'
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
  startCheckpointAction,
  startBranchDevelopmentAction,
  startDeployDevelopmentAction,
  startPromoteReviewAction,
  startPromoteProductionAction,
  startShipAction,
  startHandoverAction,
  startResumeAction,
  startRepairCompatibilityAction,
  startPublishAction,
  applyTctbpUpgradePlan,
  loadTctbpBootstrapJob,
  startTctbpBootstrap,
  loadRepositoryDetail,
  loadTctbpUpgradePlan,
  loadTctbpBootstrapReview,
  loadTctbpUpgradeReview,
  prepareTctbpBootstrap,
} from './api-client'
import { intentForRecommendation } from './recommended-intent'
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
  const [actionJob, setActionJob] = useState<ActionerJob | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [upgradePlan, setUpgradePlan] = useState<TctbpUpgradePlan | null>(null)
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [applyBusy, setApplyBusy] = useState(false)
  const [upgradeFeedback, setUpgradeFeedback] = useState<string | null>(null)
  const [aiReview, setAiReview] = useState<AiReviewResult | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [bootstrapPlan, setBootstrapPlan] = useState<TctbpBootstrapPlan | null>(null)
  const [bootstrapBusy, setBootstrapBusy] = useState(false)
  const [bootstrapApplyBusy, setBootstrapApplyBusy] = useState(false)
  const [bootstrapApplyFeedback, setBootstrapApplyFeedback] = useState<string | null>(null)
  const [bootstrapJob, setBootstrapJob] = useState<TctbpBootstrapJob | null>(null)
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

  useEffect(() => {
    if (
      !selectedId
      || !bootstrapJob
      || bootstrapJob.status === 'completed'
      || bootstrapJob.status === 'failed'
    ) return
    const timer = window.setTimeout(() => {
      void loadTctbpBootstrapJob(selectedId, bootstrapJob.jobId)
        .then((nextJob) => {
          setBootstrapJob(nextJob)
          if (nextJob.status === 'completed') {
            setBootstrapApplyBusy(false)
            setBootstrapApplyFeedback(
              `Bootstrap completed on ${nextJob.result?.branch ?? 'the dedicated branch'} with ${nextJob.result?.appliedPaths.length ?? 0} file(s). Review and checkpoint before publishing.`,
            )
            void refreshDetail(selectedId, intent)
          } else if (nextJob.status === 'failed') {
            setBootstrapApplyBusy(false)
            setBootstrapApplyFeedback(nextJob.error ?? 'Bootstrap failed before completion.')
          }
        })
        .catch((cause) => captureError(cause, requestId.current))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [bootstrapJob, intent, selectedId])

  useEffect(() => {
    if (
      !selectedId
      || !actionJob
      || actionJob.status === 'completed'
      || actionJob.status === 'failed'
    ) return
    const timer = window.setTimeout(() => {
      void loadActionerJob(selectedId, actionJob.jobId)
        .then((nextJob) => {
          setActionJob(nextJob)
          if (nextJob.status === 'completed' || nextJob.status === 'failed') {
            setActionBusy(false)
            void refreshDetail(selectedId, intent).then((refreshed) => {
              if (!refreshed) {
                setActionFeedback(
                  `${nextJob.workflowId} completed, but the Adviser could not refresh repository state. Refresh manually before continuing.`,
                )
              }
            })
          }
        })
        .catch((cause) => captureError(cause, requestId.current))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [actionJob, intent, selectedId])

  async function runAction(workflowId: ActionerWorkflowId): Promise<void> {
    if (!selectedId || !detail?.intentPlan?.fingerprint) return
    const confirmations: Record<ActionerWorkflowId, string> = {
      checkpoint: 'Create a local checkpoint commit? No push, branch switch, merge, or deployment will occur.',
      publish: 'Publish the current branch to origin? No merge, tag, deploy, or release will occur.',
      'branch-development': 'Create and switch to the configured development branch? No publish or deployment will occur.',
      'repair-tctbp-script-compatibility': 'Add scripts/package.json to scope TCTBP CommonJS scripts without committing or publishing.',
      handover: 'Create continuation context and publish the current branch for another machine.',
      resume: 'Reconcile the clean local branch with its origin state. No force update will occur.',
      'promote-review': 'Promote the current development branch into review? This will merge, verify, and publish review. No deployment will occur.',
      'promote-production': 'Promote the current review branch into main? This will merge, verify, and prepare main for ship. No deploy or push will occur.',
      ship: 'Ship a release from main? This will bump the version, create a tag, and push to origin.',
      'deploy-development': 'Deploy the development branch to the configured development environment? No merge or production action will occur.',
    }
    if (!window.confirm(confirmations[workflowId])) return
    setActionBusy(true)
    setActionFeedback(null)
    setError(null)
    try {
      const starters: Record<ActionerWorkflowId, () => Promise<ActionerJobStart>> = {
        checkpoint: () => startCheckpointAction(
          selectedId,
          detail.intentPlan!.fingerprint,
          detail.intentPlan!.intent,
        ),
        publish: () => startPublishAction(selectedId, detail.intentPlan!.fingerprint),
        'branch-development': () => startBranchDevelopmentAction(selectedId, detail.intentPlan!.fingerprint),
        'repair-tctbp-script-compatibility': () => startRepairCompatibilityAction(selectedId, detail.intentPlan!.fingerprint),
        handover: () => startHandoverAction(selectedId, detail.intentPlan!.fingerprint),
        resume: () => startResumeAction(selectedId, detail.intentPlan!.fingerprint),
        'promote-review': () => startPromoteReviewAction(selectedId, detail.intentPlan!.fingerprint),
        'promote-production': () => startPromoteProductionAction(selectedId, detail.intentPlan!.fingerprint),
        ship: () => startShipAction(selectedId, detail.intentPlan!.fingerprint),
        'deploy-development': () => startDeployDevelopmentAction(selectedId, detail.intentPlan!.fingerprint),
      }
      const startedJob = await starters[workflowId]()
      setActionJob({
        jobId: startedJob.jobId,
        repositoryId: selectedId,
        workflowId,
        status: 'queued',
        steps: [],
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      })
    } catch (cause) {
      setActionBusy(false)
      const message = cause instanceof Error ? cause.message : 'Action could not start.'
      setActionFeedback(message)
      captureError(cause, requestId.current)
    }
  }

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

  async function applyUpgrade(
    mode: Parameters<typeof applyTctbpUpgradePlan>[3],
    approvedPaths: string[],
    approvedDeletionPaths: string[],
    confirmDeletions: boolean,
    confirmation: string,
  ): Promise<void> {
    if (!selectedId || !upgradePlan?.fingerprint || aiReview?.status !== 'available') return
    if (!window.confirm(confirmation)) return
    setApplyBusy(true)
    setUpgradeFeedback(null)
    setError(null)
    try {
      const result = await applyTctbpUpgradePlan(
        selectedId,
        upgradePlan.fingerprint,
        aiReview.reviewId,
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
    setBootstrapApplyBusy(false)
    setBootstrapApplyFeedback(null)
    setBootstrapJob(null)
    setActionJob(null)
    setActionBusy(false)
    setActionFeedback(null)
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
    setBootstrapApplyBusy(false)
    setBootstrapApplyFeedback(null)
    setBootstrapJob(null)
    setActionJob(null)
    setActionBusy(false)
    setActionFeedback(null)
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

  const { resolved } = useTheme()

  return (
    <div className={`min-h-screen flex flex-col ${resolved}`}>
      <nav
        aria-label="Application"
        className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b border-teal-700 bg-gradient-to-r from-teal-900 to-teal-700 text-white shadow-md"
      >
        <button
          aria-label="Show repository portfolio"
          className="flex items-center gap-3 text-left"
          type="button"
          onClick={showPortfolio}
        >
          <span
            aria-hidden="true"
            className="grid w-10 h-10 text-lg font-black leading-none place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 text-cream-50"
          >
            T
          </span>
          <span className="leading-tight">
            <strong className="block text-lg tracking-tight">TCTBP</strong>
            <small className="block text-xs text-white/60 uppercase tracking-widest">Adviser</small>
          </span>
        </button>
        <div className="flex items-center gap-4">
          <span className="hidden md:inline text-xs text-white/60 uppercase tracking-widest">
            Local-first repository portfolio
          </span>
          <Button variant="secondary" size="sm" onClick={showReference}>
            TCTBP reference
          </Button>
          <ThemeToggle />
        </div>
      </nav>

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        {error && (
          <section className="ad-surface p-8 border-l-4 border-red-500 flex items-end justify-between gap-8" role="alert">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-red-600">Inspection unavailable</p>
              <h1 className="mt-1 text-3xl font-semibold text-text-primary">The Adviser stopped safely.</h1>
              <p className="mt-2 text-text-secondary max-w-2xl">{error}</p>
            </div>
            <Button variant="primary" onClick={retry}>
              Try again
            </Button>
          </section>
        )}

        {referenceOpen && catalogue ? (
          <ReferenceExplorer catalogue={catalogue} onBack={showPortfolio} />
        ) : selectedId && detail ? (
          <RepositoryDetail
            detail={detail}
            actionJob={actionJob}
            actionBusy={actionBusy}
            actionFeedback={actionFeedback}
            onRunAction={(workflowId) => void runAction(workflowId)}
            onRepairCompatibility={() => void runAction('repair-tctbp-script-compatibility')}
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
          <section className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-text-muted" aria-live="polite">
            <span
              aria-hidden="true"
              className="w-10 h-10 border-[3px] border-ink-200 border-t-teal-500 rounded-full animate-spin"
            />
            <p className="text-sm">
              {referenceOpen
                ? 'Loading the pinned TCTBP reference…'
                : selectedId
                ? 'Inspecting the selected repository…'
                : 'Discovering local repositories…'}
            </p>
          </section>
        ) : null}
      </main>

      <footer className="py-8 text-center text-xs text-text-faint uppercase tracking-widest">
        Local evidence remains primary · No Git fetch · No repository mutation
      </footer>
    </div>
  )
}

export default App
