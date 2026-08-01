import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SafeConfigurationExport } from '../shared/diagnostics'
import { BoundedGitExecutor } from './git-command'
import type { ServiceConfig } from './config'
import { CanonicalTctbpSourceService } from './tctbp-source'
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
  return {
    sessionToken,
    registry,
    inspections,
    github,
    tctbpSource,
    audit,
    configuration: safeConfigurationExport(config),
    portfolio: new PortfolioService(config, registry, inspections, github),
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
