import type {
  ActionerIntent,
  ActionerJob,
  ActionerWorkflowId,
} from '../shared/actioner'
import type { RecommendationIntent } from '../shared/recommendation'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import {
  actionConfirmation,
  startWorkflowAction,
  workflowForRecommendation,
} from './action-workflows'
import { intentForRecommendation } from './recommended-intent'
import { startAddOriginAction, startCreateOriginAction } from './api'

export interface WorkflowActionsDependencies {
  selectedId: string | null
  detail: RepositoryDetailResult | null
  intent: RecommendationIntent
  setIntent: (intent: RecommendationIntent) => void
  refreshDetail: (
    repositoryId: string,
    intent: RecommendationIntent,
  ) => Promise<RepositoryDetailResult | null>
  setActionJob: (job: ActionerJob) => void
  setActionBusy: (busy: boolean) => void
  setActionFeedback: (message: string | null) => void
  setError: (message: string | null) => void
  reportError: (cause: unknown) => void
}

export interface WorkflowActions {
  runAction: (workflowId: ActionerWorkflowId) => Promise<void>
  runRecommendedAction: () => Promise<void>
  /** Adds a user-supplied URL as the origin remote (remote-less repos). */
  addOrigin: (url: string) => Promise<void>
  /** Creates a GitHub repository and connects it as origin (remote-less repos). */
  createOrigin: (name: string, visibility: 'private' | 'public') => Promise<void>
}

/**
 * Owns how workflow actions (checkpoint, publish, resume, handover, …) are
 * started from the detail page: the confirmation prompt, the plan fingerprint
 * handshake, and the recommended-action shortcut that keeps the intent and
 * plan aligned with the card's state-driven recommendation.
 */
export function useWorkflowActions(
  deps: WorkflowActionsDependencies,
): WorkflowActions {
  const {
    selectedId,
    detail,
    intent,
    setIntent,
    refreshDetail,
    setActionJob,
    setActionBusy,
    setActionFeedback,
    setError,
    reportError,
  } = deps

  async function startActionWorkflow(
    repositoryId: string,
    workflowId: ActionerWorkflowId,
    planFingerprint: string,
    planIntent: ActionerIntent,
  ): Promise<void> {
    if (!window.confirm(actionConfirmation(workflowId, detail?.observation.tctbp.branchModel ?? null))) return
    setActionBusy(true)
    setActionFeedback(null)
    setError(null)
    try {
      const startedJob = await startWorkflowAction(
        workflowId,
        repositoryId,
        planFingerprint,
        planIntent,
      )
      setActionJob({
        jobId: startedJob.jobId,
        repositoryId,
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
      reportError(cause)
    }
  }

  async function runAction(workflowId: ActionerWorkflowId): Promise<void> {
    if (!selectedId || !detail?.intentPlan?.fingerprint) return
    await startActionWorkflow(
      selectedId,
      workflowId,
      detail.intentPlan.fingerprint,
      detail.intentPlan.intent,
    )
  }

  /** Adds a user-supplied origin URL; no plan fingerprint is involved. */
  async function addOrigin(url: string): Promise<void> {
    if (!selectedId) return
    if (!window.confirm(actionConfirmation('add-origin', null))) return
    setActionBusy(true)
    setActionFeedback(null)
    setError(null)
    try {
      const startedJob = await startAddOriginAction(selectedId, url)
      setActionJob({
        jobId: startedJob.jobId,
        repositoryId: selectedId,
        workflowId: 'add-origin',
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
      const message = cause instanceof Error
        ? cause.message
        : 'Add origin could not start.'
      setActionFeedback(message)
      reportError(cause)
    }
  }

  /** Runs the state-driven recommendation as a workflow action. */
  async function runRecommendedAction(): Promise<void> {
    if (!selectedId || !detail) return
    const suggestedIntent = intentForRecommendation(
      detail.recommendation.primaryAction,
    )
    const workflowId = workflowForRecommendation(
      detail.recommendation.primaryAction,
    )
    if (!suggestedIntent || !workflowId) return
    if (intent === suggestedIntent) {
      await runAction(workflowId)
      return
    }
    // The user switched intent: restore the recommended outcome and refresh
    // the plan so the workflow runs against a matching fingerprint.
    setIntent(suggestedIntent)
    const nextDetail = await refreshDetail(selectedId, suggestedIntent)
    if (nextDetail?.intentPlan?.fingerprint) {
      await startActionWorkflow(
        selectedId,
        workflowId,
        nextDetail.intentPlan.fingerprint,
        nextDetail.intentPlan.intent,
      )
    } else {
      setActionFeedback(
        'The recommended plan could not be prepared. Review the repository state and retry.',
      )
    }
  }

  /** Creates a GitHub repository under the account and connects it as origin. */
  async function createOrigin(
    name: string,
    visibility: 'private' | 'public',
  ): Promise<void> {
    if (!selectedId) return
    if (!window.confirm(actionConfirmation('create-origin', null))) return
    setActionBusy(true)
    setActionFeedback(null)
    setError(null)
    try {
      const startedJob = await startCreateOriginAction(
        selectedId,
        name,
        visibility,
      )
      setActionJob({
        jobId: startedJob.jobId,
        repositoryId: selectedId,
        workflowId: 'create-origin',
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
      const message = cause instanceof Error
        ? cause.message
        : 'Create origin could not start.'
      setActionFeedback(message)
      reportError(cause)
    }
  }

  return { runAction, runRecommendedAction, addOrigin, createOrigin }
}
