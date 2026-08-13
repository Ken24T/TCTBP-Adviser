import type { UpgradeBatchRequest, UpgradeBatchStageId } from '../shared/upgrade-batch'
import type {
  TctbpUpgradePlan,
  TctbpApplyRequest,
  TctbpApplyStep,
} from '../shared/tctbp-upgrade'
import type { RepositoryObservation } from '../shared/inspection'
import { requireAiApproval } from './api-route-helpers'
import type { AiReviewStore } from './ai-review-store'
import { AdviserError } from './errors'
import type { RepositoryInspectionService } from './inspection'
import type { RegisteredRepository } from './registry'
import type { CanonicalTctbpSourceService } from './tctbp-source'
import { CheckpointActioner } from './checkpoint-actioner'
import { PublishActioner } from './publish-actioner'

export type UpgradeBatchProgress = (
  stageId: UpgradeBatchStageId,
  status: 'running' | 'completed' | 'failed' | 'skipped',
  detail: string,
) => void

export interface UpgradeBatchRunnerDependencies {
  inspections: RepositoryInspectionService
  tctbpSource: CanonicalTctbpSourceService
  aiReviewStore: AiReviewStore
}

const EXECUTION_ORDER: UpgradeBatchStageId[] = [
  'apply',
  'checkpoint',
  'publish',
  'merge',
  'cleanup',
]

/**
 * Runs the reviewed upgrade journey as a single ordered batch: apply →
 * checkpoint → publish → merge → cleanup. Every stage re-validates its own
 * precondition against the live repository state (re-inspected after each
 * mutation) and is skipped when it does not apply; the batch stops at the
 * first failure so nothing is ever applied or merged blindly.
 */
export class UpgradeBatchRunner {
  constructor(
    readonly deps: UpgradeBatchRunnerDependencies,
    readonly timeoutMs = 60_000,
    readonly maxOutputBytes = 1_048_576,
  ) {}

  async run(
    repository: RegisteredRepository,
    request: UpgradeBatchRequest,
    progress: UpgradeBatchProgress,
  ): Promise<void> {
    let observation = await this.deps.inspections.inspect(repository)
    let plan = await this.deps.tctbpSource.plan(repository.path, observation)

    // The same Jasper handshake as a single apply gates the whole batch.
    requireAiApproval(
      this.deps.aiReviewStore,
      request.aiReviewId,
      request.aiReviewAcknowledged,
      request.planFingerprint,
    )
    if (!plan.fingerprint || request.planFingerprint !== plan.fingerprint) {
      throw new AdviserError(
        'upgrade-plan-stale',
        'The upgrade plan is stale; generate a new plan before running the batch.',
      )
    }

    for (const stageId of EXECUTION_ORDER) {
      const applicable = this.stageApplicable(stageId, observation, plan)
      if (!applicable.applicable) {
        progress(stageId, 'skipped', applicable.reason)
        continue
      }
      progress(stageId, 'running', applicable.reason)
      try {
        await this.runStage(stageId, repository, observation, plan, request, progress)
        // Re-inspect after every mutation so later stages judge fresh state.
        observation = await this.deps.inspections.inspect(repository)
        plan = await this.deps.tctbpSource.plan(repository.path, observation)
        progress(stageId, 'completed', `${applicable.reason} — done.`)
      } catch (error) {
        progress(
          stageId,
          'failed',
          error instanceof Error ? error.message : 'Batch stage failed.',
        )
        throw error
      }
    }
  }

  private stageApplicable(
    stageId: UpgradeBatchStageId,
    observation: RepositoryObservation,
    plan: TctbpUpgradePlan,
  ): { applicable: boolean; reason: string } {
    switch (stageId) {
      case 'apply': {
        const pending = applyWorkPending(plan)
        if (!pending) return { applicable: false, reason: 'No apply work is pending.' }
        if (plan.blockers.length > 0) {
          return { applicable: false, reason: 'The plan is blocked; resolve blockers before applying.' }
        }
        return {
          applicable: true,
          reason: `Applying ${plan.actionCounts.add} addition(s) and ${plan.actionCounts.review} review(s) in order.`,
        }
      }
      case 'checkpoint':
        return observation.workingTree.clean
          ? { applicable: false, reason: 'Working tree is clean — nothing to checkpoint.' }
          : { applicable: true, reason: 'Checkpointing the uncommitted changes.' }
      case 'publish': {
        if (!observation.remoteOrigin) {
          return { applicable: false, reason: 'No origin remote — nothing to publish to.' }
        }
        const tracking = observation.localTracking
        const hasUnpublished = !tracking.upstream || (tracking.ahead ?? 0) > 0
        return hasUnpublished
          ? { applicable: true, reason: 'Publishing the branch to origin.' }
          : { applicable: false, reason: 'Branch is already published.' }
      }
      case 'merge':
        return plan.cleanup?.branch && !plan.cleanup.available
          ? { applicable: true, reason: `Merging ${plan.cleanup.branch} back.` }
          : { applicable: false, reason: 'No unmerged upgrade branch to merge.' }
      case 'cleanup':
        return plan.cleanup?.branch && plan.cleanup.available
          ? { applicable: true, reason: `Removing merged ${plan.cleanup.branch}.` }
          : { applicable: false, reason: 'No merged upgrade branch to clean up.' }
    }
  }

  private async runStage(
    stageId: UpgradeBatchStageId,
    repository: RegisteredRepository,
    observation: RepositoryObservation,
    plan: TctbpUpgradePlan,
    request: UpgradeBatchRequest,
    progress: UpgradeBatchProgress,
  ): Promise<void> {
    const branch = observation.head.branch
    switch (stageId) {
      case 'apply': {
        const result = await this.deps.tctbpSource.apply(
          repository.path,
          observation,
          buildApplyRequest(plan, request),
        )
        if (result.branch) {
          progress(
            'apply',
            'running',
            `Applied ${result.appliedPaths.length} change(s) on ${result.branch}.`,
          )
        }
        return
      }
      case 'checkpoint':
        await new CheckpointActioner(this.timeoutMs, this.maxOutputBytes)
          .run(repository.path, branch, () => undefined)
        return
      case 'publish':
        await new PublishActioner(this.timeoutMs, this.maxOutputBytes)
          .run(repository.path, branch, () => undefined)
        return
      case 'merge':
        await this.deps.tctbpSource.mergeUpgradeBranch(repository.path, observation)
        return
      case 'cleanup':
        await this.deps.tctbpSource.cleanupUpgradeBranch(repository.path, observation)
        return
    }
  }
}

/** True when the plan has any step left to apply. */
export function applyWorkPending(plan: TctbpUpgradePlan): boolean {
  const alignmentPending = Boolean(
    plan.sourceAlignment !== 'current'
    && plan.actionCounts.add === 0
    && plan.actionCounts.review === 0
    && plan.policy.state === 'aligned'
    && (plan.drift.obsoleteTargets?.length ?? 0) === 0
  )
  return [
    plan.policy.state === 'drifted',
    plan.actionCounts.add > 0,
    plan.actionCounts.review > 0,
    (plan.drift.obsoleteTargets?.length ?? 0) > 0,
    alignmentPending,
  ].some(Boolean)
}

/** Builds the ordered apply-in-order request against the reviewed plan. */
export function buildApplyRequest(
  plan: TctbpUpgradePlan,
  request: UpgradeBatchRequest,
): TctbpApplyRequest {
  const steps: TctbpApplyStep[] = []
  if (plan.policy.state === 'drifted') {
    steps.push({
      mode: 'approved-managed-files',
      approvedPaths: ['.github/TCTBP.json'],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    })
  }
  if (plan.actionCounts.add > 0) {
    steps.push({
      mode: 'additions-only',
      approvedPaths: [],
      approvedDeletionPaths: [],
      confirmDeletions: false,
    })
  }
  if (plan.actionCounts.review > 0) {
    steps.push({
      mode: 'approved-managed-files',
      approvedPaths: plan.drift.files
        .filter((file) => file.state === 'drifted')
        .map((file) => file.path),
      approvedDeletionPaths: [],
      confirmDeletions: false,
    })
  }
  const obsoletePaths = (plan.drift.obsoleteTargets ?? []).map((file) => file.path)
  if (obsoletePaths.length > 0) {
    steps.push({
      mode: 'approved-managed-files',
      approvedPaths: [],
      approvedDeletionPaths: obsoletePaths,
      confirmDeletions: true,
    })
  }
  return {
    confirm: true,
    aiReviewId: request.aiReviewId,
    aiReviewAcknowledged: true,
    planFingerprint: request.planFingerprint,
    mode: 'approved-managed-files',
    approvedPaths: [],
    approvedDeletionPaths: [],
    confirmDeletions: false,
    steps,
  }
}
