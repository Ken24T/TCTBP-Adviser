import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RepositoryDetailResult } from '../shared/repository-detail'
import type { ApiRuntime } from './api-runtime'
import { readRepositoryFavicon, resolveRepositoryFavicon } from './favicon'
import { sendJson } from './http-errors'
import { planIntent } from './intents/planner'
import { repositoryReference } from './reference/catalogue'
import { recommend } from './recommendations/engine'
import {
  readRecommendationIntent,
  requireEmptyBody,
} from './request-input'
import { summarizeUpgradePlan } from './tctbp-portfolio'

/**
 * Handles the per-repository inspection routes (portfolio refresh, favicon,
 * inspection, recommendation, detail). Returns true when the route was
 * handled.
 */
export async function handleRepositoryRoutes(
  runtime: ApiRuntime,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (
    request.method === 'POST'
    && url.pathname === '/api/repositories/refresh'
  ) {
    await requireEmptyBody(request)
    sendJson(response, 200, await runtime.portfolio.get(true))
    return true
  }

  const refreshMatch = /^\/api\/repositories\/([^/]+)\/refresh$/.exec(
    url.pathname,
  )
  if (request.method === 'POST' && refreshMatch) {
    await requireEmptyBody(request)
    sendJson(
      response,
      200,
      await runtime.portfolio.refreshRepository(
        decodeURIComponent(refreshMatch[1]),
      ),
    )
    return true
  }

  const faviconMatch = /^\/api\/repositories\/([^/]+)\/favicon$/.exec(
    url.pathname,
  )
  if (request.method === 'GET' && faviconMatch) {
    const repository = await runtime.registry.require(
      decodeURIComponent(faviconMatch[1]),
    )
    const relativePath = await resolveRepositoryFavicon(repository.path)
    const favicon = relativePath
      ? await readRepositoryFavicon(repository.path, relativePath)
      : null
    if (!favicon) {
      sendJson(response, 404, {
        error: {
          code: 'repository-favicon-not-found',
          message: 'No favicon was found for this repository.',
        },
      })
      return true
    }
    response.setHeader('Content-Type', favicon.contentType)
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(favicon.body)
    return true
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
    return true
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
    return true
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
    // The detail recommendation is consistent with the portfolio card:
    // both consider the managed-surface upgrade summary.
    const upgrade = runtime.tctbpSource?.sourceRoot
      ? await runtime.tctbpSource.plan(repository.path, observation)
        .then(summarizeUpgradePlan)
        .catch(() => null)
      : null
    const result: RepositoryDetailResult = {
      observation,
      recommendation: recommend(
        observation,
        'none',
        new Date(),
        undefined,
        upgrade,
      ),
      intentPlan: null,
      reference: repositoryReference(observation),
      github,
      directoryName: repository.name,
    }
    result.intentPlan = planIntent(
      observation,
      result.recommendation,
      intent,
      deploymentEvidence,
      handoverEvidence,
    )
    sendJson(response, 200, result)
    return true
  }

  return false
}
