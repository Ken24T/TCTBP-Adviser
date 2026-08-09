import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SafeConfigurationExport } from '../shared/diagnostics'
import type {
  AppSettingsResponse,
  AppSettingsSource,
  PersistedAppSettings,
} from '../shared/app-settings'
import { createAiReviewer, type AiReviewer } from './ai-reviewer'
import { loadPersistedAppSettings, savePersistedAppSettings } from './app-settings'
import { buildUpgradeReviewEvidence } from './ai-review-evidence'
import { AiReviewStore } from './ai-review-store'
import { TctbpBootstrapJobStore } from './tctbp-bootstrap-jobs'
import { ActionerJobStore } from './actioner-jobs'
import { CheckpointActioner } from './checkpoint-actioner'
import { BranchActioner } from './branch-actioner'
import { RepairActioner } from './repair-actioner'
import { HandoverActioner } from './handover-actioner'
import { ResumeActioner } from './resume-actioner'
import { DeploymentEvidenceStore } from './deployment-evidence'
import { HandoverEvidenceStore } from './handover-evidence'
import { PublishActioner } from './publish-actioner'
import { DeployActioner } from './deploy-actioner'
import { PromoteActioner } from './promote-actioner'
import { ShipActioner } from './ship-actioner'
import { readActionerRequest } from './actioner-input'
import { BoundedGitExecutor } from './git-command'
import { loadServiceConfig } from './config'
import type { ServiceConfig } from './config'
import { CanonicalTctbpSourceService } from './tctbp-source'
import { readTctbpApplyRequest } from './tctbp-apply-input'
import { readBootstrapRequest } from './tctbp-bootstrap-input'
import { readBootstrapApplyRequest } from './tctbp-bootstrap-apply-input'
import { safeConfigurationExport } from './configuration-export'
import { resolveAllowedRepository, resolveAllowedRoot } from './security'
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
import type { ActionerResult } from '../shared/actioner'
import { RepositoryRegistry } from './registry'
import {
  readJsonBody,
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
  readonly deployments: DeploymentEvidenceStore
  readonly handovers: HandoverEvidenceStore
  readonly portfolio: PortfolioService
  readonly audit: InspectionAuditLog
  readonly configuration: SafeConfigurationExport
  readonly environment: NodeJS.ProcessEnv
}

export function createApiRuntime(
  config: ServiceConfig,
  sessionToken = randomBytes(32).toString('base64url'),
  environment: NodeJS.ProcessEnv = process.env,
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
  const deployments = new DeploymentEvidenceStore()
  const handovers = new HandoverEvidenceStore()
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
    deployments,
    handovers,
    audit,
    configuration: safeConfigurationExport(config),
    environment,
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

function assertResumePlan(
  observation: import('../shared/inspection').RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'resume-after-machine-change',
  )
  const resumeStep = plan?.steps.find((step) => step.workflowId === 'resume')
  if (!plan || plan.fingerprint !== planFingerprint || plan.status !== 'ready' || resumeStep?.condition !== 'required') {
    throw new AdviserError('actioner-plan-stale-or-blocked', 'The resume plan is stale or blocked.')
  }
}

function assertHandoverPlan(
  observation: import('../shared/inspection').RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'continue-on-another-machine',
  )
  const handoverStep = plan?.steps.find((step) => step.workflowId === 'handover')
  if (!plan || plan.fingerprint !== planFingerprint || plan.status !== 'ready' || handoverStep?.condition !== 'required') {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The handover plan is stale or blocked.',
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

function assertPromotePlan(
  observation: import('../shared/inspection').RepositoryObservation,
  planFingerprint: string,
  targetBranch: string,
  intent: import('../shared/actioner').ActionerIntent,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    intent,
  )
  const promoteStep = plan?.steps.find(
    (step) => step.workflowId === 'promote' && step.targetBranch === targetBranch,
  )
  if (
    !plan
    || plan.fingerprint !== planFingerprint
    || plan.status !== 'ready'
    || !promoteStep
    || promoteStep.condition !== 'required'
  ) {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      `The promote ${targetBranch} plan is stale, blocked, or not currently required.`,
    )
  }
}

function assertShipPlan(
  observation: import('../shared/inspection').RepositoryObservation,
  planFingerprint: string,
): void {
  const plan = planIntent(
    observation,
    recommend(observation, 'none', new Date()),
    'prepare-production-release',
  )
  const shipStep = plan?.steps.find(
    (step) => step.workflowId === 'ship',
  )
  if (
    !plan
    || plan.fingerprint !== planFingerprint
    || plan.status !== 'ready'
    || !shipStep
    || shipStep.condition !== 'required'
  ) {
    throw new AdviserError(
      'actioner-plan-stale-or-blocked',
      'The ship plan is stale, blocked, or not currently required.',
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

/**
 * Completes a workflow action job and drops the cached portfolio snapshot so
 * the next read reflects the repository mutation (tone responsiveness).
 */
function completeActionJob(
  jobs: ActionerJobStore,
  portfolio: PortfolioService,
  jobId: string,
  result: ActionerResult,
): void {
  jobs.complete(jobId, result)
  portfolio.invalidate()
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
      if (request.method === 'GET' && url.pathname === '/api/settings') {
        sendJson(response, 200, await readSettingsResponse(runtime))
        return
      }
      if (request.method === 'PUT' && url.pathname === '/api/settings') {
        const persisted = await loadPersistedAppSettings(runtime.environment)
        const next = await applyPersistedSettings(
          persisted,
          await readJsonBody(request),
        )
        await savePersistedAppSettings(next, runtime.environment)
        await applyEffectiveSettingsToRuntime(runtime)
        sendJson(response, 200, await readSettingsResponse(runtime))
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
            completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
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
            completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
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
            completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
          } catch (error) {
            runtime.actionerJobs.fail(job.jobId, safeActionerJobError(error))
          }
        })()
        sendJson(response, 202, { jobId: job.jobId, status: 'started' })
        return
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
        return
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
            completeActionJob(runtime.actionerJobs, runtime.portfolio, job.jobId, result)
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
        return
      }

      const promoteReviewMatch =
        /^\/api\/repositories\/([^/]+)\/actions\/promote-review$/.exec(url.pathname)
      if (request.method === 'POST' && promoteReviewMatch) {
        const actionRequest = await readActionerRequest(request)
        const repository = await runtime.registry.require(
          decodeURIComponent(promoteReviewMatch[1]),
        )
        const observation = await runtime.inspections.inspect(repository)
        assertPromotePlan(observation, actionRequest.planFingerprint, 'review', 'prepare-pre-production')
        const job = runtime.actionerJobs.create(repository.id, 'promote-review')
        void (async () => {
          try {
            runtime.actionerJobs.start(job.jobId)
            const currentObservation = await runtime.inspections.inspect(repository)
            assertPromotePlan(currentObservation, actionRequest.planFingerprint, 'review', 'prepare-pre-production')
            const result = await new PromoteActioner({
              workflowId: 'promote-review',
              key: 'review',
              sourceBranch: 'development',
              targetBranch: 'review',
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
        return
      }

      const promoteProductionMatch =
        /^\/api\/repositories\/([^/]+)\/actions\/promote-production$/.exec(url.pathname)
      if (request.method === 'POST' && promoteProductionMatch) {
        const actionRequest = await readActionerRequest(request)
        const repository = await runtime.registry.require(
          decodeURIComponent(promoteProductionMatch[1]),
        )
        const observation = await runtime.inspections.inspect(repository)
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
              sourceBranch: 'review',
              targetBranch: 'main',
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
        return
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
            const result = await new ShipActioner().run(
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
            runtime.portfolio.invalidate()
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
        runtime.portfolio.invalidate()
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
        const deploymentEvidence = await runtime.deployments.get(
          repository.id,
          'development',
          observation.head.branch,
          observation.head.sha,
        )
        const handoverEvidence = await runtime.handovers.get(
          repository.id,
          observation.head.branch,
          observation.head.sha,
        )
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
          deploymentEvidence,
          handoverEvidence,
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

function environmentHasValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): boolean {
  const value = environment[name]
  return value !== undefined && value !== ''
}

function settingsFieldSource(
  environment: NodeJS.ProcessEnv,
  name: string,
  persistedPresent: boolean,
): AppSettingsSource {
  if (persistedPresent) return 'settings'
  if (environmentHasValue(environment, name)) return 'environment'
  return 'default'
}

function rootsFieldSource(
  environment: NodeJS.ProcessEnv,
  persisted: PersistedAppSettings,
): AppSettingsSource {
  if (persisted.repositoryRoots.length > 0) return 'settings'
  if (
    environmentHasValue(environment, 'TCTBP_ADVISER_REPOSITORY_ROOTS')
    || environmentHasValue(environment, 'TCTBP_ADVISER_ALLOWED_ROOT')
  ) return 'environment'
  return 'default'
}

async function readSettingsResponse(
  runtime: ApiRuntime,
): Promise<AppSettingsResponse> {
  const persisted = await loadPersistedAppSettings(runtime.environment)
  const environment = runtime.environment
  return {
    repositoryRoots: {
      effective: runtime.registry.discovery.repositoryRoots,
      persisted: persisted.repositoryRoots,
      source: rootsFieldSource(environment, persisted),
    },
    excludeDirectories: {
      effective: runtime.registry.discovery.excludeDirectories,
      persisted: persisted.excludeDirectories,
      source: settingsFieldSource(
        environment,
        'TCTBP_ADVISER_EXCLUDE_DIRECTORIES',
        persisted.excludeDirectories.length > 0,
      ),
    },
    maximumDepth: {
      effective: runtime.registry.discovery.maximumDepth,
      persisted: persisted.maximumDepth,
      source: settingsFieldSource(
        environment,
        'TCTBP_ADVISER_MAXIMUM_DEPTH',
        persisted.maximumDepth !== null,
      ),
    },
    canonicalTctbpWebRoot: {
      effective: runtime.tctbpSource.sourceRoot,
      persisted: persisted.canonicalTctbpWebRoot,
      source: settingsFieldSource(
        environment,
        'TCTBP_ADVISER_TCTBP_WEB_ROOT',
        persisted.canonicalTctbpWebRoot !== null,
      ),
    },
    githubEnabled: {
      effective: runtime.github.config.enabled,
      persisted: persisted.githubEnabled,
      source: settingsFieldSource(
        environment,
        'TCTBP_ADVISER_GITHUB_ENABLED',
        persisted.githubEnabled !== null,
      ),
    },
    githubRepositories: {
      effective: runtime.github.config.repositories,
      persisted: persisted.githubRepositories,
      source: settingsFieldSource(
        environment,
        'TCTBP_ADVISER_GITHUB_REPOSITORIES',
        persisted.githubRepositories.length > 0,
      ),
    },
  }
}

function settingsObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AdviserError(
      'settings-request-invalid',
      'Settings request must contain a JSON object.',
    )
  }
  return body as Record<string, unknown>
}

async function applyPersistedSettings(
  persisted: PersistedAppSettings,
  body: unknown,
): Promise<PersistedAppSettings> {
  const update = settingsObject(body)
  const next: PersistedAppSettings = { ...persisted }

  if ('repositoryRoots' in update) {
    next.repositoryRoots = await validateRepositoryRoots(update.repositoryRoots)
  }
  if ('excludeDirectories' in update) {
    next.excludeDirectories = validateDirectoryNames(update.excludeDirectories)
  }
  if ('maximumDepth' in update) {
    next.maximumDepth = validateMaximumDepth(update.maximumDepth)
  }
  if ('canonicalTctbpWebRoot' in update) {
    next.canonicalTctbpWebRoot = await validateCanonicalRoot(
      update.canonicalTctbpWebRoot,
      next.repositoryRoots,
    )
  }
  if ('githubEnabled' in update) {
    next.githubEnabled = validateBooleanSetting(update.githubEnabled)
  }
  if ('githubRepositories' in update) {
    next.githubRepositories = validateGithubRepositories(update.githubRepositories)
  }

  return next
}

async function applyEffectiveSettingsToRuntime(runtime: ApiRuntime): Promise<void> {
  const config = await loadServiceConfig(runtime.environment)
  runtime.registry.updateRepositoryRoots(config.repositoryRoots)
  runtime.registry.discovery.setExcludeDirectories(config.excludeDirectories)
  runtime.registry.discovery.setMaximumDepth(config.maximumDepth)
  runtime.tctbpSource.setSourceRoot(config.canonicalTctbpWebRoot ?? null)
  runtime.github.setConfig({
    ...runtime.github.config,
    enabled: config.github.enabled,
    repositories: config.github.repositories,
  })
}

async function validateRepositoryRoots(candidate: unknown): Promise<string[]> {
  if (!Array.isArray(candidate)) {
    throw new AdviserError(
      'settings-request-invalid',
      'repositoryRoots must be an array of absolute directory paths.',
    )
  }
  if (candidate.length === 0) {
    throw new AdviserError(
      'settings-request-invalid',
      'At least one repository root is required.',
    )
  }
  if (candidate.length > 10) {
    throw new AdviserError(
      'settings-request-invalid',
      'A maximum of 10 repository roots is supported.',
    )
  }
  const roots = new Set<string>()
  for (const entry of candidate) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new AdviserError(
        'settings-request-invalid',
        'Each repository root must be a non-empty path.',
      )
    }
    try {
      roots.add(await resolveAllowedRoot(entry))
    } catch (error) {
      throw new AdviserError(
        'settings-request-invalid',
        error instanceof Error
          ? error.message
          : 'A repository root could not be resolved.',
        { cause: error },
      )
    }
  }
  return Array.from(roots)
}

function validateDirectoryNames(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) {
    throw new AdviserError(
      'settings-request-invalid',
      'excludeDirectories must be an array of directory names.',
    )
  }
  if (candidate.length > 20) {
    throw new AdviserError(
      'settings-request-invalid',
      'A maximum of 20 excluded directories is supported.',
    )
  }
  const names = new Set<string>()
  for (const entry of candidate) {
    if (
      typeof entry !== 'string'
      || entry.trim().length === 0
      || entry.includes('/')
      || entry.includes('\\')
      || entry === '.'
      || entry === '..'
    ) {
      throw new AdviserError(
        'settings-request-invalid',
        'Each excluded directory must be a simple directory name.',
      )
    }
    names.add(entry)
  }
  return Array.from(names)
}

function validateMaximumDepth(candidate: unknown): number | null {
  if (candidate === null) return null
  if (
    typeof candidate !== 'number'
    || !Number.isInteger(candidate)
    || candidate < 0
    || candidate > 10
  ) {
    throw new AdviserError(
      'settings-request-invalid',
      'maximumDepth must be an integer between 0 and 10.',
    )
  }
  return candidate
}

async function validateCanonicalRoot(
  candidate: unknown,
  effectiveRoots: string[],
): Promise<string | null> {
  if (candidate === null) return null
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new AdviserError(
      'settings-request-invalid',
      'The TCTBP-Web root must be a repository path or null.',
    )
  }
  for (const root of effectiveRoots) {
    try {
      return (await resolveAllowedRepository(root, candidate)).repositoryPath
    } catch {
      // Try the next configured root.
    }
  }
  throw new AdviserError(
    'settings-request-invalid',
    'The TCTBP-Web root must resolve to a repository inside a configured root.',
  )
}

function validateBooleanSetting(candidate: unknown): boolean | null {
  if (candidate === null) return null
  if (typeof candidate !== 'boolean') {
    throw new AdviserError(
      'settings-request-invalid',
      'githubEnabled must be a boolean or null.',
    )
  }
  return candidate
}

function validateGithubRepositories(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) {
    throw new AdviserError(
      'settings-request-invalid',
      'githubRepositories must be an array of GitHub repository names.',
    )
  }
  if (candidate.length > 100) {
    throw new AdviserError(
      'settings-request-invalid',
      'A maximum of 100 GitHub repositories is supported.',
    )
  }
  const names = new Set<string>()
  for (const entry of candidate) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new AdviserError(
        'settings-request-invalid',
        'Each GitHub repository must be a non-empty name.',
      )
    }
    names.add(entry)
  }
  return Array.from(names)
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
  if (error.code === 'settings-request-invalid') return 400
  if (error.code === 'actioner-request-invalid') return 400
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
