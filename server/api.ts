import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleActionRoutes } from './api-action-routes'
import type { ApiRuntime } from './api-runtime'
import { handleRepositoryRoutes } from './api-repository-routes'
import { handleSystemRoutes } from './api-system-routes'
import { handleUpgradeRoutes } from './api-upgrade-routes'
import { errorCode } from './errors'
import { publicMessage, sendJson, statusForError } from './http-errors'
import { enforceRequestTrust } from './request-trust'

/**
 * Builds the Adviser HTTP handler. The handler dispatches to the
 * domain route groups in order; each group returns true when it handled
 * the request. System, action, upgrade, and repository routes live in
 * their own modules (api-system-routes, api-action-routes,
 * api-upgrade-routes, api-repository-routes).
 */
export function createApiHandler(runtime: ApiRuntime) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    try {
      enforceRequestTrust(request, runtime.sessionToken)
      const url = new URL(request.url ?? '/', 'http://localhost')

      if (await handleSystemRoutes(runtime, request, response, url)) return
      if (await handleActionRoutes(runtime, request, response, url)) return
      if (await handleUpgradeRoutes(runtime, request, response, url)) return
      if (await handleRepositoryRoutes(runtime, request, response, url)) return

      sendJson(response, 404, {
        error: { code: 'route-not-found', message: 'Route not found.' },
      })
    } catch (error) {
      const status = statusForError(error)
      if (status >= 500) {
        console.error(
          `[adviser-api] ${request.method} ${request.url} failed:`,
          error,
        )
      }
      sendJson(response, status, {
        error: {
          code: errorCode(error),
          message: publicMessage(error, status),
        },
      })
    }
  }
}
