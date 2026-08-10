import type { IncomingMessage, ServerResponse } from 'node:http'
import { readActionerRequest } from './actioner-input'
import type { ApiRuntime } from './api-runtime'
import {
  completeActionJob,
  safeActionerJobError,
} from './api-route-helpers'
import { BranchActioner } from './branch-actioner'
import { CheckpointActioner } from './checkpoint-actioner'
import { DeployActioner } from './deploy-actioner'
import { AdviserError } from './errors'
import { HandoverActioner } from './handover-actioner'
import { sendJson } from './http-errors'
import {
  assertBranchDevelopmentPlan,
  assertCheckpointPlan,
  assertDeployDevelopmentPlan,
  assertHandoverPlan,
  assertPromotePlan,
  assertPublishPlan,
  assertResumePlan,
  assertShipPlan,
} from './plan-assertions'
import { PromoteActioner } from './promote-actioner'
import { PublishActioner } from './publish-actioner'
import { RepairActioner } from './repair-actioner'
import { ResumeActioner } from './resume-actioner'
import { ShipActioner } from './ship-actioner'

/**
 * Handles the workflow-action routes (action job polling and the ten
 * explicit workflow starters). Returns true when the route was handled.
 */
export async function handleActionRoutes(
  runtime: ApiRuntime,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const actionJobMatch =
    /^\/api\/repositories\/([^/]+)\/action-jobs\/([^/]+)$/.exec(url.pathname)
  if (request.method === 'GET' && actionJobMatch) {
    const repository = await runtime.registry.require(
      decodeURIComponent(actionJobMatch[1]),
    )
    const job = runtime.actionerJobs.get(
      decodeURIComponent(actionJobMatch[2]),
      repository.id,
    )
    if (!job) throw new AdviserError('actioner-job-not-found', 'Actioner job was not found.')
    sendJson(response, 200, job)
    return true
  }

  const checkpointActionMatch =
    /^\/api\/repositories\/([^/]+)\/actions\/checkpoint$/.exec(url.pathname)
  if (request.method === 'POST' && checkpointActionMatch) {
    const actionRequest = await readActionerRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(checkpointActionMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    assertCheckpointPlan(observation, actionRequest.planFingerprint, actionRequest.intent)
    const job = runtime.actionerJobs.create(repository.id, 'checkpoint')
    void (async () => {
      try {
        runtime.actionerJobs.start(job.jobId)
        const currentObservation = await runtime.inspections.inspect(repository)
        assertCheckpointPlan(currentObservation, actionRequest.planFingerprint, actionRequest.intent)
        const result = await new CheckpointActioner().run(
          repository.path,
          currentObservation.head.branch,
          (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
        )
        completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
      } catch (error) {
        runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  const publishActionMatch =
    /^\/api\/repositories\/([^/]+)\/actions\/publish$/.exec(url.pathname)
  if (request.method === 'POST' && publishActionMatch) {
    const actionRequest = await readActionerRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(publishActionMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    assertPublishPlan(observation, actionRequest.planFingerprint, actionRequest.intent)
    const job = runtime.actionerJobs.create(repository.id, 'publish')
    void (async () => {
      try {
        runtime.actionerJobs.start(job.jobId)
        const currentObservation = await runtime.inspections.inspect(repository)
        assertPublishPlan(currentObservation, actionRequest.planFingerprint, actionRequest.intent)
        const result = await new PublishActioner().run(
          repository.path,
          currentObservation.head.branch,
          (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
        )
        completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
      } catch (error) {
        runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  const branchDevelopmentMatch =
    /^\/api\/repositories\/([^/]+)\/actions\/branch-development$/.exec(url.pathname)
  if (request.method === 'POST' && branchDevelopmentMatch) {
    const actionRequest = await readActionerRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(branchDevelopmentMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    assertBranchDevelopmentPlan(observation, actionRequest.planFingerprint)
    const job = runtime.actionerJobs.create(repository.id, 'branch-development')
    void (async () => {
      try {
        runtime.actionerJobs.start(job.jobId)
        const currentObservation = await runtime.inspections.inspect(repository)
        assertBranchDevelopmentPlan(currentObservation, actionRequest.planFingerprint)
        const result = await new BranchActioner().run(
          repository.path,
          currentObservation.head.branch,
          (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
        )
        completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
      } catch (error) {
        runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  const handoverActionMatch =
    /^\/api\/repositories\/([^/]+)\/actions\/handover$/.exec(url.pathname)
  if (request.method === 'POST' && handoverActionMatch) {
    const actionRequest = await readActionerRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(handoverActionMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    assertHandoverPlan(observation, actionRequest.planFingerprint)
    const job = runtime.actionerJobs.create(repository.id, 'handover')
    void (async () => {
      try {
        runtime.actionerJobs.start(job.jobId)
        const currentObservation = await runtime.inspections.inspect(repository)
        assertHandoverPlan(currentObservation, actionRequest.planFingerprint)
        const result = await new HandoverActioner().run(
          repository.path,
          currentObservation.head.branch,
          (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
        )
        await runtime.handovers.record({
          repositoryId: repository.id,
          branch: result.branch ?? 'unknown',
          commitSha: result.commitSha ?? '',
          completedAt: new Date().toISOString(),
          workflow: 'handover',
          workflowCompleted: true,
          summary: 'Handover completed; continuation context and branch publication were handled by TCTBP.',
        })
        completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
      } catch (error) {
        runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  const resumeActionMatch =
    /^\/api\/repositories\/([^/]+)\/actions\/resume$/.exec(url.pathname)
  if (request.method === 'POST' && resumeActionMatch) {
    const actionRequest = await readActionerRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(resumeActionMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    assertResumePlan(observation, actionRequest.planFingerprint)
    const job = runtime.actionerJobs.create(repository.id, 'resume')
    void (async () => {
      try {
        runtime.actionerJobs.start(job.jobId)
        const currentObservation = await runtime.inspections.inspect(repository)
        assertResumePlan(currentObservation, actionRequest.planFingerprint)
        const result = await new ResumeActioner().run(
          repository.path,
          currentObservation.head.branch,
          (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
        )
        completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
      } catch (error) {
        runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  const repairCompatibilityMatch =
    /^\/api\/repositories\/([^/]+)\/actions\/repair-tctbp-script-compatibility$/.exec(url.pathname)
  if (request.method === 'POST' && repairCompatibilityMatch) {
    const actionRequest = await readActionerRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(repairCompatibilityMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    assertDeployDevelopmentPlan(observation, actionRequest.planFingerprint)
    const job = runtime.actionerJobs.create(repository.id, 'repair-tctbp-script-compatibility')
    void (async () => {
      try {
        runtime.actionerJobs.start(job.jobId)
        const currentObservation = await runtime.inspections.inspect(repository)
        assertDeployDevelopmentPlan(currentObservation, actionRequest.planFingerprint)
        const result = await new RepairActioner().run(
          repository.path,
          currentObservation.head.branch,
          (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
        )
        completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
      } catch (error) {
        runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  const deployDevelopmentMatch =
    /^\/api\/repositories\/([^/]+)\/actions\/deploy-development$/.exec(url.pathname)
  if (request.method === 'POST' && deployDevelopmentMatch) {
    const actionRequest = await readActionerRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(deployDevelopmentMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    assertDeployDevelopmentPlan(observation, actionRequest.planFingerprint)
    const job = runtime.actionerJobs.create(repository.id, 'deploy-development')
    void (async () => {
      try {
        runtime.actionerJobs.start(job.jobId)
        const currentObservation = await runtime.inspections.inspect(repository)
        assertDeployDevelopmentPlan(currentObservation, actionRequest.planFingerprint)
        const result = await new DeployActioner().run(
          repository.path,
          currentObservation.head.branch,
          (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
        )
        await runtime.deployments.record({
          repositoryId: repository.id,
          environment: 'development',
          branch: currentObservation.head.branch ?? 'development',
          commitSha: result.commitSha ?? '',
          completedAt: new Date().toISOString(),
          workflow: 'deploy-development',
          workflowCompleted: true,
          runtimeVerification: 'not-verified',
          summary: 'Development deployment workflow completed; runtime health verification is not configured.',
        })
        completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
      } catch (error) {
        runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  const promoteReviewMatch =
    /^\/api\/repositories\/([^/]+)\/actions\/promote-review$/.exec(url.pathname)
  if (request.method === 'POST' && promoteReviewMatch) {
    const actionRequest = await readActionerRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(promoteReviewMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    const model = observation.tctbp.branchModel
    const sourceBranch = model.workingBranch ?? 'development'
    const targetBranch = model.preProductionBranch ?? 'review'
    assertPromotePlan(observation, actionRequest.planFingerprint, targetBranch, 'prepare-pre-production')
    const job = runtime.actionerJobs.create(repository.id, 'promote-review')
    void (async () => {
      try {
        runtime.actionerJobs.start(job.jobId)
        const currentObservation = await runtime.inspections.inspect(repository)
        assertPromotePlan(currentObservation, actionRequest.planFingerprint, targetBranch, 'prepare-pre-production')
        const result = await new PromoteActioner({
          workflowId: 'promote-review',
          key: targetBranch,
          sourceBranch,
          targetBranch,
          publishTarget: true,
        }).run(
          repository.path,
          currentObservation.head.branch,
          (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
        )
        completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
      } catch (error) {
        runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  const promoteProductionMatch =
    /^\/api\/repositories\/([^/]+)\/actions\/promote-production$/.exec(url.pathname)
  if (request.method === 'POST' && promoteProductionMatch) {
    const actionRequest = await readActionerRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(promoteProductionMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    const model = observation.tctbp.branchModel
    const sourceBranch = model.preProductionBranch ?? 'review'
    const targetBranch = model.productionBranch ?? 'main'
    assertPromotePlan(observation, actionRequest.planFingerprint, 'production', 'prepare-production-release')
    const job = runtime.actionerJobs.create(repository.id, 'promote-production')
    void (async () => {
      try {
        runtime.actionerJobs.start(job.jobId)
        const currentObservation = await runtime.inspections.inspect(repository)
        assertPromotePlan(currentObservation, actionRequest.planFingerprint, 'production', 'prepare-production-release')
        const result = await new PromoteActioner({
          workflowId: 'promote-production',
          key: 'production',
          sourceBranch,
          targetBranch,
          publishTarget: false,
        }).run(
          repository.path,
          currentObservation.head.branch,
          (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
        )
        completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
      } catch (error) {
        runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  const shipMatch =
    /^\/api\/repositories\/([^/]+)\/actions\/ship$/.exec(url.pathname)
  if (request.method === 'POST' && shipMatch) {
    const actionRequest = await readActionerRequest(request)
    const repository = await runtime.registry.require(
      decodeURIComponent(shipMatch[1]),
    )
    const observation = await runtime.inspections.inspect(repository)
    assertShipPlan(observation, actionRequest.planFingerprint)
    const job = runtime.actionerJobs.create(repository.id, 'ship')
    void (async () => {
      try {
        runtime.actionerJobs.start(job.jobId)
        const currentObservation = await runtime.inspections.inspect(repository)
        assertShipPlan(currentObservation, actionRequest.planFingerprint)
        const result = await new ShipActioner(
          currentObservation.tctbp.branchModel.productionBranch ?? 'main',
        ).run(
          repository.path,
          currentObservation.head.branch,
          (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
        )
        completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
      } catch (error) {
        runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
      }
    })()
    sendJson(response, 202, { jobId: job.jobId, status: 'started' })
    return true
  }

  return false
}
