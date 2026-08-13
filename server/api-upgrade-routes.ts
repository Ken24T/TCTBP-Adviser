import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildUpgradeReviewEvidence } from './ai-review-evidence'
import type { ApiRuntime } from './api-runtime'
import {
  requireAiApproval,
  safeBootstrapJobError,
} from './api-route-helpers'
import { AdviserError } from './errors'
import { sendJson } from './http-errors'
import { readBootstrapApplyRequest } from './tctbp-bootstrap-apply-input'
import { readBootstrapRequest } from './tctbp-bootstrap-input'
import { readTctbpApplyRequest } from './tctbp-apply-input'
import { requireEmptyBody } from './request-input'
import { readUpgradeBatchRequest } from './upgrade-batch-input'
import { UpgradeBatchRunner } from './upgrade-batch-runner'

/**
 * Handles the TCTBP bootstrap and upgrade routes (plan preview, Jasper
 * review, apply, and job polling). Returns true when the route was handled.
 */
export async function handleUpgradeRoutes(
  runtime: ApiRuntime,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const bootstrapReviewMatch =
    /^\/api\/repositories\/([^/]+)\/tctbp-bootstrap-review$/.exec(url.pathname)
  if (request.method === 'POST' && bootstrapReviewMatch) {
    const bootstrapRequest = await readBootstrapRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(bootstrapReviewMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    const [plan, bootstrapPlan] = await Promise.all([
      runtime.tctbpSource.plan(repository.path, observation),
      runtime.tctbpSource.bootstrapPlan(observation, bootstrapRequest),
    ])
    const evidence = buildUpgradeReviewEvidence(
      repository.name,
      observation,
      plan,
      bootstrapPlan,
    )
    const result = await runtime.aiReviewer.reviewUpgradePlan(evidence)
    runtime.aiReviewStore.put(result)
    sendJson(response, 200, result)
    return true
  }

  const bootstrapJobMatch =
    /^\/api\/repositories\/([^/]+)\/tctbp-bootstrap-jobs\/([^/]+)$/.exec(url.pathname)
  if (request.method === 'GET' && bootstrapJobMatch) {
    const repository = await runtime.registry.require(
      decodeURIComponent(bootstrapJobMatch[1]),
    )
    const job = runtime.bootstrapJobs.get(
      decodeURIComponent(bootstrapJobMatch[2]),
      repository.id,
    )
    if (!job) {
      throw new AdviserError('bootstrap-job-not-found', 'Bootstrap job was not found.')
    }
    sendJson(response, 200, job)
    return true
  }

  const bootstrapApplyMatch =
    /^\/api\/repositories\/([^/]+)\/tctbp-bootstrap-apply$/.exec(url.pathname)
  if (request.method === 'POST' && bootstrapApplyMatch) {
    const bootstrapRequest = await readBootstrapApplyRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(bootstrapApplyMatch[1]),
    )
    const job = runtime.bootstrapJobs.create(repository.id)
    const progress = runtime.bootstrapJobs.progress(job.jobId)
    void (async () => {
      try {
        runtime.bootstrapJobs.start(job.jobId)
        progress('validate', 'Re-inspecting the target before bootstrap.')
        const observation = await runtime.inspections.inspect(repository)
        const bootstrapPlan = await runtime.tctbpSource.bootstrapPlan(
          observation,
          bootstrapRequest.request,
        )
        requireAiApproval(
          runtime.aiReviewStore,
          bootstrapRequest.aiReviewId,
          bootstrapRequest.aiReviewAcknowledged,
          bootstrapPlan.fingerprint,
        )
        const result = await runtime.tctbpSource.bootstrapApply(
          repository.path,
          observation,
          bootstrapRequest,
          progress,
        )
        runtime.bootstrapJobs.complete(job.jobId, result)
        await runtime.portfolio.refreshAfterMutation(repository.id)
      } catch (error) {
        runtime.bootstrapJobs.fail(job.jobId, safeBootstrapJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  const bootstrapPlanMatch =
    /^\/api\/repositories\/([^/]+)\/tctbp-bootstrap-plan$/.exec(url.pathname)
  if (request.method === 'POST' && bootstrapPlanMatch) {
    const bootstrapRequest = await readBootstrapRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(bootstrapPlanMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    const plan = await runtime.tctbpSource.bootstrapPlan(
      observation,
      bootstrapRequest,
    )
    sendJson(response, 200, plan)
    return true
  }

  const upgradePlanMatch =
    /^\/api\/repositories\/([^/]+)\/tctbp-upgrade-plan$/.exec(url.pathname)
  if (request.method === 'POST' && upgradePlanMatch) {
    await requireEmptyBody(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(upgradePlanMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    const plan = await runtime.tctbpSource.plan(
      repository.path,
      observation,
    )
    sendJson(response, 200, plan)
    return true
  }

  const reviewMatch =
    /^\/api\/repositories\/([^/]+)\/tctbp-upgrade-review$/.exec(url.pathname)
  if (request.method === 'POST' && reviewMatch) {
    await requireEmptyBody(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(reviewMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    const plan = await runtime.tctbpSource.plan(repository.path, observation)
    const evidence = buildUpgradeReviewEvidence(
      repository.name,
      observation,
      plan,
    )
    const result = await runtime.aiReviewer.reviewUpgradePlan(evidence)
    runtime.aiReviewStore.put(result)
    sendJson(response, 200, result)
    return true
  }

  const applyMatch =
    /^\/api\/repositories\/([^/]+)\/tctbp-apply$/.exec(url.pathname)
  if (request.method === 'POST' && applyMatch) {
    const applyRequest = await readTctbpApplyRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(applyMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    const currentPlan = await runtime.tctbpSource.plan(repository.path, observation)
    requireAiApproval(
      runtime.aiReviewStore,
      applyRequest.aiReviewId,
      applyRequest.aiReviewAcknowledged,
      currentPlan.fingerprint,
    )
    const result = await runtime.tctbpSource.apply(
      repository.path,
      observation,
      applyRequest,
    )
    await runtime.portfolio.refreshAfterMutation(repository.id)
    sendJson(response, 200, result)
    return true
  }

  const cleanupMatch =
    /^\/api\/repositories\/([^/]+)\/tctbp-cleanup$/.exec(url.pathname)
  if (request.method === 'POST' && cleanupMatch) {
    await requireEmptyBody(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(cleanupMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    const result = await runtime.tctbpSource.cleanupUpgradeBranch(
      repository.path,
      observation,
    )
    await runtime.portfolio.refreshAfterMutation(repository.id)
    sendJson(response, 200, result)
    return true
  }

  const mergeMatch =
    /^\/api\/repositories\/([^/]+)\/tctbp-merge$/.exec(url.pathname)
  if (request.method === 'POST' && mergeMatch) {
    await requireEmptyBody(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(mergeMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    const result = await runtime.tctbpSource.mergeUpgradeBranch(
      repository.path,
      observation,
    )
    await runtime.portfolio.refreshAfterMutation(repository.id)
    sendJson(response, 200, result)
    return true
  }

  const batchStartMatch =
    /^\/api\/repositories\/([^/]+)\/upgrade-batch$/.exec(url.pathname)
  if (request.method === 'POST' && batchStartMatch) {
    const batchRequest = await readUpgradeBatchRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(batchStartMatch[1]),
    )
    const run = runtime.upgradeBatchRuns.create(repository.id)
    void (async () => {
      try {
        runtime.upgradeBatchRuns.start(run.runId)
        const runner = new UpgradeBatchRunner({
          inspections: runtime.inspections,
          tctbpSource: runtime.tctbpSource,
          aiReviewStore: runtime.aiReviewStore,
        })
        await runner.run(
          repository,
          batchRequest,
          (stageId, status, detail) => runtime.upgradeBatchRuns.stage(
            run.runId,
            stageId,
            status,
            detail,
          ),
        )
        runtime.upgradeBatchRuns.complete(run.runId)
        await runtime.portfolio.refreshAfterMutation(repository.id)
      } catch (error) {
        runtime.upgradeBatchRuns.fail(run.runId, safeBootstrapJobError(error))
      }
    })()
    sendJson(response, 202, { runId: run.runId, status: 'started' })
    return true
  }

  const batchPollMatch =
    /^\/api\/repositories\/([^/]+)\/upgrade-batch\/([^/]+)$/.exec(url.pathname)
  if (request.method === 'GET' && batchPollMatch) {
    const repository = await runtime.registry.require(
      decodeURIComponent(batchPollMatch[1]),
    )
    const run = runtime.upgradeBatchRuns.get(
      decodeURIComponent(batchPollMatch[2]),
      repository.id,
    )
    if (!run) {
      throw new AdviserError(
        'upgrade-batch-not-found',
        'Upgrade batch run was not found.',
      )
    }
    sendJson(response, 200, run)
    return true
  }

  return false
}
