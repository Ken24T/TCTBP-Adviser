import type { IncomingMessage, ServerResponse } from 'node:http'
import { normalisePreferences } from '../shared/portfolio-preferences'
import {
  loadPersistedAppSettings,
  savePersistedAppSettings,
} from './app-settings'
import type { ApiRuntime } from './api-runtime'
import { sendJson } from './http-errors'
import {
  loadPersistedPortfolioPreferences,
  savePersistedPortfolioPreferences,
} from './portfolio-preferences'
import { referenceCatalogue } from './reference/catalogue'
import { readJsonBody, requireEmptyBody } from './request-input'
import {
  applyEffectiveSettingsToRuntime,
  applyPersistedSettings,
  readSettingsResponse,
} from './settings-routes'

/**
 * Handles the system-wide routes (health, settings, preferences, portfolio
 * listing, reference catalogue, diagnostics, configuration export).
 * Returns true when the route was handled.
 */
export async function handleSystemRoutes(
  runtime: ApiRuntime,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true })
    return true
  }
  if (request.method === 'GET' && url.pathname === '/api/settings') {
    sendJson(response, 200, await readSettingsResponse(runtime))
    return true
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
    return true
  }
  if (
    request.method === 'POST'
    && url.pathname === '/api/settings/github/test'
  ) {
    await requireEmptyBody(request)
    sendJson(response, 200, await runtime.githubAccess.status())
    return true
  }
  if (request.method === 'GET' && url.pathname === '/api/preferences') {
    sendJson(
      response,
      200,
      await loadPersistedPortfolioPreferences(runtime.environment),
    )
    return true
  }
  if (request.method === 'PUT' && url.pathname === '/api/preferences') {
    const preferences = normalisePreferences(await readJsonBody(request))
    await savePersistedPortfolioPreferences(preferences, runtime.environment)
    sendJson(response, 200, preferences)
    return true
  }
  if (
    request.method === 'GET'
    && url.pathname === '/api/repositories'
  ) {
    sendJson(response, 200, {
      repositories: await runtime.registry.list(),
    })
    return true
  }
  if (request.method === 'GET' && url.pathname === '/api/portfolio') {
    sendJson(response, 200, await runtime.portfolio.get())
    return true
  }
  if (request.method === 'GET' && url.pathname === '/api/catalogue') {
    sendJson(response, 200, referenceCatalogue())
    return true
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
    return true
  }
  if (
    request.method === 'GET'
    && url.pathname === '/api/catalogue/workflows'
  ) {
    sendJson(response, 200, {
      workflows: referenceCatalogue().workflows,
    })
    return true
  }
  if (
    request.method === 'GET'
    && url.pathname === '/api/catalogue/guardrails'
  ) {
    sendJson(response, 200, {
      guardrails: referenceCatalogue().guardrails,
    })
    return true
  }
  if (
    request.method === 'GET'
    && url.pathname === '/api/diagnostics/inspections'
  ) {
    sendJson(response, 200, { entries: runtime.audit.list() })
    return true
  }
  if (
    request.method === 'GET'
    && url.pathname === '/api/configuration/export'
  ) {
    sendJson(response, 200, runtime.configuration)
    return true
  }
  return false
}
