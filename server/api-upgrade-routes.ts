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
        runtime.portfolio.invalidate()
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
    runtime.portfolio.invalidate()
    sendJson(response, 200, result)
    return true
  }

  return false
}
