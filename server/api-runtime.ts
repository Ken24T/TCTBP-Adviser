import { randomBytes } from 'node:crypto'
import type { SafeConfigurationExport } from '../shared/diagnostics'
import { createAiReviewer, type AiReviewer } from './ai-reviewer'
import { AiReviewStore } from './ai-review-store'
import { TctbpBootstrapJobStore } from './tctbp-bootstrap-jobs'
import { ActionerJobStore } from './actioner-jobs'
import { UpgradeBatchStore } from './upgrade-batch-store'
import { DeploymentEvidenceStore } from './deployment-evidence'
import { HandoverEvidenceStore } from './handover-evidence'
import { BoundedGitExecutor } from './git-command'
import { loadServiceConfig, type ServiceConfig } from './config'
import { CanonicalTctbpSourceService } from './tctbp-source'
import { safeConfigurationExport } from './configuration-export'
import { RepositoryDiscovery } from './discovery'
import { RepositoryInspectionService } from './inspection'
import { InspectionAuditLog } from './audit'
import { LocalGitInspector } from './local-git'
import { GitHubRestClient } from './github-client'
import { GitHubProvider } from './github-provider'
import { GitHubAccessService } from './github-access'
import { GitHubEnrichmentService } from './github-enrichment'
import { PortfolioService } from './portfolio'
import { RepositoryRegistry } from './registry'

export interface ApiRuntime {
  readonly sessionToken: string
  readonly registry: RepositoryRegistry
  readonly inspections: RepositoryInspectionService
  readonly github: GitHubEnrichmentService
  readonly githubAccess: GitHubAccessService
  readonly tctbpSource: CanonicalTctbpSourceService
  readonly aiReviewer: AiReviewer
  readonly aiReviewStore: AiReviewStore
  readonly bootstrapJobs: TctbpBootstrapJobStore
  readonly actionerJobs: ActionerJobStore
  readonly upgradeBatchRuns: UpgradeBatchStore
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
  githubClient: GitHubRestClient = new GitHubRestClient(config.github),
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
      githubClient,
    ),
  )
  const githubAccess = new GitHubAccessService(
    config.github,
    githubClient,
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
  const upgradeBatchRuns = new UpgradeBatchStore()
  const deployments = new DeploymentEvidenceStore()
  const handovers = new HandoverEvidenceStore()
  return {
    sessionToken,
    registry,
    inspections,
    github,
    githubAccess,
    tctbpSource,
    aiReviewer,
    aiReviewStore,
    bootstrapJobs,
    actionerJobs,
    upgradeBatchRuns,
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
