import type { AiReviewResult } from '../shared/ai-review'
import type { RecommendationIntent } from '../shared/recommendation'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import type {
  TctbpApplyMode,
  TctbpUpgradePlan,
} from '../shared/tctbp-upgrade'
import {
  applyTctbpUpgradePlan,
  cleanupTctbpUpgradeBranch,
  mergeTctbpUpgradeBranch,
} from './api'

export interface ApplyStepDefinition {
  mode: TctbpApplyMode
  approvedPaths: string[]
  approvedDeletionPaths: string[]
  confirmDeletions: boolean
  confirmation: string
  label: string
}

export interface UpgradeApplyDependencies {
  selectedId: string | null
  upgradePlan: TctbpUpgradePlan | null
  aiReview: AiReviewResult | null
  intent: RecommendationIntent
  refreshDetail: (
    repositoryId: string,
    intent: RecommendationIntent,
  ) => Promise<RepositoryDetailResult | null>
  refreshUpgradePlan: (repositoryId: string) => Promise<void>
  setApplyBusy: (busy: boolean) => void
  setUpgradeFeedback: (message: string | null) => void
  setError: (message: string | null) => void
  markMutated: () => void
  reportError: (cause: unknown) => void
}

export interface UpgradeApply {
  applyAdditions: () => Promise<void>
  applyPolicy: () => Promise<void>
  applyDrifted: () => Promise<void>
  applyAlignment: () => Promise<void>
  applyDeleteObsolete: () => Promise<void>
  applyInOrder: () => Promise<void>
  cleanupUpgradeBranch: () => Promise<void>
  mergeUpgradeBranch: () => Promise<void>
}

/**
 * Owns how canonical TCTBP managed files are applied from the upgrade panel:
 * the confirmation prompt, the plan-fingerprint handshake with Jasper's review,
 * and the guided "apply in order" run that applies the applicable steps in a
 * single atomic request against one plan and one review. Everything is
 * working-tree only — nothing is committed or pushed.
 */
export function useUpgradeApply(deps: UpgradeApplyDependencies): UpgradeApply {
  const {
    selectedId,
    upgradePlan,
    aiReview,
    intent,
    refreshDetail,
    refreshUpgradePlan,
    setApplyBusy,
    setUpgradeFeedback,
    setError,
    markMutated,
    reportError,
  } = deps

  function additionsStep(): ApplyStepDefinition {
    return {
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
      confirmation: 'Apply missing canonical TCTBP files? No commit or push will be performed.',
      label: 'Apply additions',
    }
  }

  function driftedStep(): ApplyStepDefinition {
    const driftedPaths = upgradePlan?.drift.files
      ?.filter((file) => file.state === 'drifted')
      .map((file) => file.path) ?? []
    return {
      mode: 'approved-managed-files',
      approvedPaths: driftedPaths,
      approvedDeletionPaths: [],
      confirmDeletions: false,
      confirmation: `Overwrite ${driftedPaths.length} drifted managed file(s) with canonical content? Local versions will be replaced. No commit or push will be performed.`,
      label: 'Apply drifted files',
    }
  }

  /** True when the only remaining work is recording the source alignment. */
  function alignmentOnly(): boolean {
    const plan = upgradePlan
    return Boolean(
      plan
      && plan.sourceAlignment !== 'current'
      && plan.actionCounts.add === 0
      && plan.actionCounts.review === 0
      && plan.policy.state === 'aligned'
      && (plan.drift.obsoleteTargets?.length ?? 0) === 0
    )
  }

  function alignmentStep(): ApplyStepDefinition {
    return {
      mode: 'approved-managed-files',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
      confirmation: 'Record the canonical TCTBP-Web source alignment? This writes .tctbp/source.json. No commit or push will be performed.',
      label: 'Record source alignment',
    }
  }

  function policyStep(): ApplyStepDefinition {
    return {
      mode: 'approved-managed-files',
      approvedPaths: ['.github/TCTBP.json'],
      approvedDeletionPaths: [],
      confirmDeletions: false,
      confirmation: 'Merge canonical TCTBP infrastructure policy sections? No commit or push will be performed.',
      label: 'Apply policy merge',
    }
  }

  function deleteStep(): ApplyStepDefinition {
    const obsoletePaths = upgradePlan?.drift.obsoleteTargets
      ?.map((file) => file.path) ?? []
    return {
      mode: 'approved-managed-files',
      approvedPaths: [],
      approvedDeletionPaths: obsoletePaths,
      confirmDeletions: true,
      confirmation: `Delete ${obsoletePaths.length} obsolete canonical TCTBP file(s)? This cannot be undone by the Adviser.`,
      label: 'Delete obsolete files',
    }
  }

  function applicableSteps(): ApplyStepDefinition[] {
    if (!upgradePlan) return []
    const steps: ApplyStepDefinition[] = []
    if (upgradePlan.policy.state === 'drifted') steps.push(policyStep())
    if (upgradePlan.actionCounts.add > 0) steps.push(additionsStep())
    if (upgradePlan.actionCounts.review > 0) steps.push(driftedStep())
    if ((upgradePlan.drift.obsoleteTargets?.length ?? 0) > 0) {
      steps.push(deleteStep())
    }
    if (alignmentOnly()) steps.push(alignmentStep())
    return steps
  }

  async function runSteps(
    steps: ApplyStepDefinition[],
    confirmation: string,
  ): Promise<void> {
    if (!selectedId || !upgradePlan?.fingerprint || aiReview?.status !== 'available') return
    if (!window.confirm(confirmation)) return
    setApplyBusy(true)
    setUpgradeFeedback(null)
    setError(null)
    try {
      const first = steps[0]
      if (!first) return
      // A single reviewed plan is applied in one request: when multiple
      // steps are present they are sent as ordered steps so the server can
      // apply the whole plan against one fingerprint + one Jasper review.
      const result = steps.length > 1
        ? await applyTctbpUpgradePlan(
            selectedId,
            upgradePlan.fingerprint,
            aiReview.reviewId,
            first.mode,
            [],
            [],
            false,
            steps.map((step) => ({
              mode: step.mode,
              approvedPaths: step.approvedPaths,
              approvedDeletionPaths: step.approvedDeletionPaths,
              confirmDeletions: step.confirmDeletions,
            })),
          )
        : await applyTctbpUpgradePlan(
            selectedId,
            upgradePlan.fingerprint,
            aiReview.reviewId,
            first.mode,
            first.approvedPaths,
            first.approvedDeletionPaths,
            first.confirmDeletions,
          )
      if (result.appliedPaths.length > 0) markMutated()
      await refreshDetail(selectedId, intent)
      await refreshUpgradePlan(selectedId)
      // Set feedback after the refresh so the plan's "commit before
      // continuing" notice is paired with the success message instead of
      // being wiped by refreshUpgradePlan.
      setUpgradeFeedback(
        result.appliedPaths.length > 0
          ? `Applied ${result.appliedPaths.length} change(s). Review the working tree, then checkpoint from the card.`
          : 'There were no approved changes to apply.',
      )
    } catch (cause) {
      reportError(cause)
    } finally {
      setApplyBusy(false)
    }
  }

  function applyAdditions(): Promise<void> {
    const step = additionsStep()
    return runSteps([step], step.confirmation)
  }

  function applyDrifted(): Promise<void> {
    const step = driftedStep()
    return runSteps([step], step.confirmation)
  }

  function applyAlignment(): Promise<void> {
    const step = alignmentStep()
    return runSteps([step], step.confirmation)
  }

  function applyPolicy(): Promise<void> {
    const step = policyStep()
    return runSteps([step], step.confirmation)
  }

  function applyDeleteObsolete(): Promise<void> {
    const step = deleteStep()
    return runSteps([step], step.confirmation)
  }

  async function cleanupUpgradeBranch(): Promise<void> {
    if (!selectedId) return
    const cleanup = upgradePlan?.cleanup
    if (!cleanup?.branch || !cleanup.available) return
    if (!window.confirm(
      `Remove the merged upgrade branch ${cleanup.branch} locally and on origin? Its commits are already part of the current branch, so nothing is lost.`,
    )) return
    setApplyBusy(true)
    setUpgradeFeedback(null)
    setError(null)
    try {
      const result = await cleanupTctbpUpgradeBranch(selectedId)
      markMutated()
      await refreshDetail(selectedId, intent)
      await refreshUpgradePlan(selectedId)
      setUpgradeFeedback(
        result.status === 'cleaned'
          ? `Removed ${result.branch} (${[
            result.localDeleted ? 'local' : null,
            result.remoteDeleted ? 'remote' : null,
          ].filter(Boolean).join(' + ') || 'nothing to remove'}).`
          : 'There was no upgrade branch to clean up.',
      )
    } catch (cause) {
      reportError(cause)
    } finally {
      setApplyBusy(false)
    }
  }

  async function applyInOrder(): Promise<void> {
    const steps = applicableSteps()
    if (steps.length === 0) return
    await runSteps(
      steps,
      `Apply in order: ${steps.map((step) => step.label).join(' → ')}? Nothing will be committed or pushed.`,
    )
  }

  async function mergeUpgradeBranch(): Promise<void> {
    if (!selectedId) return
    const branch = upgradePlan?.cleanup?.branch
    if (!branch) return
    if (!window.confirm(
      `Merge ${branch} back into the environment branch and push? The Adviser fast-forwards and refuses if the branches have diverged.`,
    )) return
    setApplyBusy(true)
    setUpgradeFeedback(null)
    setError(null)
    try {
      const result = await mergeTctbpUpgradeBranch(selectedId)
      markMutated()
      await refreshDetail(selectedId, intent)
      await refreshUpgradePlan(selectedId)
      setUpgradeFeedback(
        result.status === 'merged'
          ? `Merged ${result.branch} into ${result.destinationBranch} and pushed.`
          : 'The upgrade branch is already merged.',
      )
    } catch (cause) {
      reportError(cause)
    } finally {
      setApplyBusy(false)
    }
  }

  return {
    applyAdditions,
    applyPolicy,
    applyDrifted,
    applyAlignment,
    applyDeleteObsolete,
    applyInOrder,
    cleanupUpgradeBranch,
    mergeUpgradeBranch,
  }
}
