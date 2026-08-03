import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SafeConfigurationExport } from '../shared/diagnostics'
import { createAiReviewer, type AiReviewer } from './ai-reviewer'
import { buildUpgradeReviewEvidence } from './ai-review-evidence'
import { AiReviewStore } from './ai-review-store'
import { TctbpBootstrapJobStore } from './tctbp-bootstrap-jobs'
import { ActionerJobStore } from './actioner-jobs'
import { CheckpointActioner } from './checkpoint-actioner'
import { BranchActioner } from './branch-actioner'
import { RepairActioner } from './repair-actioner'
import { PublishActioner } from './publish-actioner'
import { DeployActioner } from './deploy-actioner'
import { readActionerRequest } from './actioner-input'
import { BoundedGitExecutor } from './git-command'
import type { ServiceConfig } from './config'
import { CanonicalTctbpSourceService } from './tctbp-source'
import { readTctbpApplyRequest } from './tctbp-apply-input'
import { readBootstrapRequest } from './tctbp-bootstrap-input'
import { readBootstrapApplyRequest } from './tctbp-bootstrap-apply-input'
import { safeConfigurationExport } from './configuration-export'
import { RepositoryDiscovery } from './discovery'
import { AdviserError, errorCode } from './errors'
import { RepositoryInspectionService } from './inspection'
import { InspectionAuditLog } from './audit'
import { LocalGitInspector } from './local-git'
import { GitHubRestClient } from './github-client'
import { GitHubProvider } from './github-provider'
import { GitHubEnrichmentService } from './github-enrichment'
import { planIntent } from './intents/planner'
import {
  referenceCatalogue,
  repositoryReference,
} from './reference/catalogue'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import { PortfolioService } from './portfolio'
import { recommend } from './recommendations/engine'
import { RepositoryRegistry } from './registry'
import {
  readRecommendationIntent,
  requireEmptyBody,
} from './request-input'

export interface ApiRuntime {
  readonly sessionToken: string
  readonly registry: RepositoryRegistry
  readonly inspections: RepositoryInspectionService
  readonly github: GitHubEnrichmentService
  readonly tctbpSource: CanonicalTctbpSourceService
  readonly aiReviewer: AiReviewer
  readonly aiReviewStore: AiReviewStore
  readonly bootstrapJobs: TctbpBootstrapJobStore
  readonly actionerJobs: ActionerJobStore
  readonly portfolio: PortfolioService
  readonly audit: InspectionAuditLog
  readonly configuration: SafeConfigurationExport
}

export function createApiRuntime(
  config: ServiceConfig,
  sessionToken = randomBytes(32).toString('base64url'),
): ApiRuntime {
  const executor = new BoundedGitExecutor(
    config.commandTimeoutMs,
    config.commandMaxOutputBytes,
  )
  const registry = new RepositoryRegistry(
    new RepositoryDiscovery(config),
    config.portfolioCacheTtlMs,
  )
  const gitInspector = new LocalGitInspector(executor)
  const audit = new InspectionAuditLog()
  const inspections = new RepositoryInspectionService(gitInspector, audit)
  const github = new GitHubEnrichmentService(
    config.github,
    gitInspector,
    new GitHubProvider(
      config.github,
      new GitHubRestClient(config.github),
    ),
  )
  const tctbpSource = new CanonicalTctbpSourceService(
    config.canonicalTctbpWebRoot ?? null,
    executor,
  )
  const aiReviewer = createAiReviewer(config.ai ?? {
    enabled: false,
    apiKey: null,
    baseUrl: null,
    model: null,
    timeoutMs: 120_000,
    maximumOutputTokens: 8_000,
    maximumResponseBytes: 2 * 1024 * 1024,
  })
  const aiReviewStore = new AiReviewStore()
  const bootstrapJobs = new TctbpBootstrapJobStore()
  const actionerJobs = new ActionerJobStore()
  return {
    sessionToken,
    registry,
    inspections,
    github,
    tctbpSource,
    aiReviewer,
    aiReviewStore,
    bootstrapJobs,
    actionerJobs,
    audit,
    configuration: safeConfigurationExport(config),
    portfolio: new PortfolioService(
      config,
      registry,
      inspections,
      github,
      tctbpSource,
    ),
  }
}

function assertCheckpointPlan(
  observation: import('../shared/inspection').RepositoryObservation,
  planFingerprint: string,
  intent: import('../shared/actioner').ActionerIntent,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    intent,
  )
  const checkpointStep = plan?.steps.find((step) => step.workflowId === 'checkpoint')
  if (
    !plan
    || plan.fingerprint !== planFingerprint
    || plan.status !== 'ready'
    || checkpointStep?.condition !== 'required'
  ) {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The checkpoint plan is stale, blocked, or no longer required.',
    )
  }
}

function assertPublishPlan(
  observation: import('../shared/inspection').RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'preserve-and-publish',
  )
  const publishStep = plan?.steps.find((step) => step.workflowId === 'publish')
  if (
    !plan
    || plan.fingerprint !== planFingerprint
    || plan.status !== 'ready'
    || publishStep?.condition !== 'required'
  ) {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The publish plan is stale, blocked, or no longer required.',
    )
  }
}

function assertDeployDevelopmentPlan(
  observation: import('../shared/inspection').RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'deploy-current-environment',
  )
  const deployStep = plan?.steps.find((step) => step.workflowId === 'deploy')
  if (
    !plan
    || plan.fingerprint !== planFingerprint
    || plan.status !== 'ready'
    || deployStep?.condition !== 'required'
    || deployStep.targetBranch !== 'dev'
  ) {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The development deployment plan is stale, blocked, or not currently required.',
    )
  }
}

function assertBranchDevelopmentPlan(
  observation: import('../shared/inspection').RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'deploy-current-environment',
  )
  const branchStep = plan?.steps.find(
    (step) => step.workflowId === 'branch' && step.targetBranch === 'development',
  )
  if (!plan || plan.fingerprint !== planFingerprint || !branchStep || branchStep.condition !== 'required') {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The development branch activation plan is stale or blocked.',
    )
  }
}

function safeActionerJobError(error: unknown): string {
  if (error instanceof AdviserError) return `${error.code}: ${error.message}`
  const value = error as { message?: unknown; stderr?: unknown }
  const message = typeof value.message === 'string' ? value.message : 'Actioner workflow failed before completion.'
  const stderr = typeof value.stderr === 'string' ? value.stderr.trim() : ''
  const detail = sanitiseActionerDetail(stderr || message)
  return detail.length > 0 ? `Actioner workflow failed: ${detail.slice(0, 800)}` : 'Actioner workflow failed before completion.'
}

function sanitiseActionerDetail(value: string): string {
  return value
    .replace(/https?:\/\/[^\s]+/gi, '[remote-url]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/token[=:]\s*[^\s]+/gi, 'token=[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeBootstrapJobError(error: unknown): string {
  if (error instanceof AdviserError) return `${error.code}: ${error.message}`
  return 'Bootstrap failed before completion.'
}

function requireAiApproval(
  store: AiReviewStore,
  reviewId: string,
  acknowledged: boolean,
  currentPlanFingerprint: string | undefined,
): void {
  if (!acknowledged) {
    throw new AdviserError(
      'ai-review-acknowledgement-required',
      'A successful Jasper review must be acknowledged before applying changes.',
    )
  }
  const review = store.get(reviewId)
  if (
    !review
    || review.status !== 'available'
    || review.planFingerprint !== currentPlanFingerprint
  ) {
    throw new AdviserError(
      'ai-review-stale-or-unavailable',
      'The Jasper review is missing, unavailable, or no longer matches the current plan.',
    )
  }
}

export function createApiHandler(runtime: ApiRuntime) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    try {
      enforceRequestTrust(request, runtime.sessionToken)
      const url = new URL(request.url ?? '/', 'http://localhost')

      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, { ok: true })
        return
      }
      if (
        request.method === 'GET'
        && url.pathname === '/api/repositories'
      ) {
        sendJson(response, 200, {
          repositories: await runtime.registry.list(),
        })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/portfolio') {
        sendJson(response, 200, await runtime.portfolio.get())
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/catalogue') {
        sendJson(response, 200, referenceCatalogue())
        return
      }
      if (
        request.method === 'GET'
        && url.pathname === '/api/catalogue/triggers'
      ) {
        sendJson(response, 200, {
          triggers: referenceCatalogue().workflows.flatMap(
            (workflow) => workflow.aliases.map((trigger) => ({
              trigger,
              workflowId: workflow.id,
            })),
          ),
        })
        return
      }
      if (
        request.method === 'GET'
        && url.pathname === '/api/catalogue/workflows'
      ) {
        sendJson(response, 200, {
          workflows: referenceCatalogue().workflows,
        })
        return
      }
      if (
        request.method === 'GET'
        && url.pathname === '/api/catalogue/guardrails'
      ) {
        sendJson(response, 200, {
          guardrails: referenceCatalogue().guardrails,
        })
        return
      }
      if (
        request.method === 'GET'
        && url.pathname === '/api/diagnostics/inspections'
      ) {
        sendJson(response, 200, { entries: runtime.audit.list() })
        return
      }
      if (
        request.method === 'GET'
        && url.pathname === '/api/configuration/export'
      ) {
        sendJson(response, 200, runtime.configuration)
        return
      }
      if (
        request.method === 'POST'
        && url.pathname === '/api/repositories/refresh'
      ) {
        await requireEmptyBody(request)
        sendJson(response, 200, await runtime.portfolio.get(true))
        return
      }

      const match = /^\/api\/repositories\/([^/]+)\/inspect$/.exec(
        url.pathname,
      )
      if (request.method === 'POST' && match) {
        await requireEmptyBody(request)
        const repository = await runtime.registry.require(
          decodeURIComponent(match[1]),
        )
        const observation = await runtime.inspections.inspect(repository)
        sendJson(response, 200, observation)
        return
      }

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
        return
      }

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
        return
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
            runtime.actionerJobs.complete(job.jobId, result)
          } catch (error) {
            runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
          }
        })()
        sendJson(response, 202, { jobId: job.jobId, status: 'started' })
        return
      }

      const publishActionMatch =
        /^\/api\/repositories\/([^/]+)\/actions\/publish$/.exec(url.pathname)
      if (request.method === 'POST' && publishActionMatch) {
        const actionRequest = await readActionerRequest(request)
        const repository = await runtime.registry.require(
          decodeURIComponent(publishActionMatch[1]),
        )
        const observation = await runtime.inspections.inspect(repository)
        assertPublishPlan(observation, actionRequest.planFingerprint)
        const job = runtime.actionerJobs.create(repository.id, 'publish')
        void (async () => {
          try {
            runtime.actionerJobs.start(job.jobId)
            const currentObservation = await runtime.inspections.inspect(repository)
            assertPublishPlan(currentObservation, actionRequest.planFingerprint)
            const result = await new PublishActioner().run(
              repository.path,
              currentObservation.head.branch,
              (step, detail) => runtime.actionerJobs.progress(job.jobId, step, detail),
            )
            runtime.actionerJobs.complete(job.jobId, result)
          } catch (error) {
            runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
          }
        })()
        sendJson(response, 202, { jobId: job.jobId, status: 'started' })
        return
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
            runtime.actionerJobs.complete(job.jobId, result)
          } catch (error) {
            runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
          }
        })()
        sendJson(response, 202, { jobId: job.jobId, status: 'started' })
        return
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
            runtime.actionerJobs.complete(job.jobId, result)
          } catch (error) {
            runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
          }
        })()
        sendJson(response, 202, { jobId: job.jobId, status: 'started' })
        return
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
            runtime.actionerJobs.complete(job.jobId, result)
          } catch (error) {
            runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
          }
        })()
        sendJson(response, 202, { jobId: job.jobId, status: 'started' })
        return
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
        return
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
          } catch (error) {
            runtime.bootstrapJobs.fail(job.jobId, safeBootstrapJobError(error))
          }
        })()
        sendJson(response, 202, { jobId: job.jobId, status: 'started' })
        return
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
        return
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
        return
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
        return
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
        sendJson(response, 200, result)
        return
      }

      const recommendationMatch =
        /^\/api\/repositories\/([^/]+)\/recommendation$/.exec(url.pathname)
      if (request.method === 'POST' && recommendationMatch) {
        const intent = await readRecommendationIntent(request)
        const repository = await runtime.registry.require(
          decodeURIComponent(recommendationMatch[1]),
        )
        const observation = await runtime.inspections.inspect(repository)
        sendJson(
          response,
          200,
          recommend(observation, intent, new Date()),
        )
        return
      }

      const detailMatch =
        /^\/api\/repositories\/([^/]+)\/detail$/.exec(url.pathname)
      if (request.method === 'POST' && detailMatch) {
        const intent = await readRecommendationIntent(request)
        const repository = await runtime.registry.require(
          decodeURIComponent(detailMatch[1]),
        )
        const [observation, github] = await Promise.all([
          runtime.inspections.inspect(repository),
          runtime.github.forLocal(repository),
        ])
        const result: RepositoryDetailResult = {
          observation,
          recommendation: recommend(observation, 'none', new Date()),
          intentPlan: null,
          reference: repositoryReference(observation),
          github,
        }
        result.intentPlan = planIntent(
          observation,
          result.recommendation,
          intent,
        )
        sendJson(response, 200, result)
        return
      }

      sendJson(response, 404, {
        error: { code: 'route-not-found', message: 'Route not found.' },
      })
    } catch (error) {
      const status = statusForError(error)
      sendJson(response, status, {
        error: {
          code: errorCode(error),
          message: publicMessage(error, status),
        },
      })
    }
  }
}

function enforceRequestTrust(
  request: IncomingMessage,
  expectedToken: string,
): void {
  const host = request.headers.host
  if (!host || !isLoopbackHost(host)) {
    throw new AdviserError(
      'request-host-rejected',
      'Request Host is not permitted.',
    )
  }

  const origin = request.headers.origin
  if (origin) {
    let originHost: string
    try {
      originHost = new URL(origin).host
    } catch {
      throw new AdviserError(
        'request-origin-rejected',
        'Request Origin is invalid.',
      )
    }
    if (originHost !== host || !isLoopbackHost(originHost)) {
      throw new AdviserError(
        'request-origin-rejected',
        'Request Origin is not permitted.',
      )
    }
  }

  const suppliedToken = request.headers['x-tctbp-session']
    ?? sessionCookie(request.headers.cookie)
  if (
    typeof suppliedToken !== 'string'
    || !tokensMatch(suppliedToken, expectedToken)
  ) {
    throw new AdviserError(
      'session-token-invalid',
      'Session token is missing or invalid.',
    )
  }
}

function sessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (name === 'tctbp_session') {
      return valueParts.join('=')
    }
  }
  return undefined
}

function isLoopbackHost(hostHeader: string): boolean {
  try {
    const host = new URL(`http://${hostHeader}`).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  } catch {
    return false
  }
}

function tokensMatch(supplied: string, expected: string): boolean {
  const suppliedBuffer = Buffer.from(supplied)
  const expectedBuffer = Buffer.from(expected)
  return (
    suppliedBuffer.length === expectedBuffer.length
    && timingSafeEqual(suppliedBuffer, expectedBuffer)
  )
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const content = JSON.stringify(value)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(content)
}

function statusForError(error: unknown): number {
  if (!(error instanceof AdviserError)) return 500
  if (error.code === 'repository-not-found') return 404
  if (error.code === 'actioner-job-not-found') return 404
  if (error.code === 'actioner-plan-stale-or-blocked') return 409
  if (
    error.code === 'request-host-rejected'
    || error.code === 'request-origin-rejected'
    || error.code === 'session-token-invalid'
  ) return 403
  if (error.code.startsWith('request-')) return 400
  return 500
}

function publicMessage(error: unknown, status: number): string {
  if (status >= 500) return 'Repository inspection failed safely.'
  return error instanceof Error ? error.message : 'Request failed.'
}
