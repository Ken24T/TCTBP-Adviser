import path from 'node:path'
import chokidar from 'chokidar'
import type {
  Connect,
  Plugin,
  PreviewServer,
  ViteDevServer,
} from 'vite'
import { createApiHandler } from './api'
import { createApiRuntime, type ApiRuntime } from './api-runtime'
import { loadServiceConfig } from './config'

/**
 * Quiet window before the backend reloads after server/shared files change.
 * Vite's own watcher ignores these paths (see vite.config.ts server.watch),
 * because an immediate restart can race a git branch switch that is rewriting
 * many files at once and load half-written modules. Absorbing the burst and
 * restarting once after it settles avoids that stale-module race.
 */
export const SERVER_RESTART_DEBOUNCE_MS = 250

export interface DebouncedRestart {
  schedule: () => void
  cancel: () => void
  readonly pending: boolean
}

/** Coalesces rapid change events into a single restart after a quiet period. */
export function createDebouncedRestart(
  restart: () => void,
  delayMs = SERVER_RESTART_DEBOUNCE_MS,
): DebouncedRestart {
  let timer: NodeJS.Timeout | undefined
  return {
    schedule(): void {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        restart()
      }, delayMs)
    },
    cancel(): void {
      if (timer) clearTimeout(timer)
      timer = undefined
    },
    get pending(): boolean {
      return timer !== undefined
    },
  }
}

export function createAdviserPlugin(
  environment: NodeJS.ProcessEnv = process.env,
): Plugin {
  return {
    name: 'tctbp-adviser-local-api',
    async configureServer(server: ViteDevServer) {
      installMiddleware(
        server.middlewares,
        await createRuntime(environment),
      )
      installDebouncedServerRestart(server)
    },
    async configurePreviewServer(server: PreviewServer) {
      installMiddleware(
        server.middlewares,
        await createRuntime(environment),
      )
    },
  }
}

function installDebouncedServerRestart(server: ViteDevServer): void {
  const root = server.config.root
  const debounce = createDebouncedRestart(() => {
    void server.restart()
  })
  const watcher = chokidar.watch([
    path.resolve(root, 'server'),
    path.resolve(root, 'shared'),
  ], { ignoreInitial: true })
  watcher.on('all', () => debounce.schedule())
  // server.restart() calls server.close(), which emits 'close' on the HTTP
  // server, so the old watcher is torn down before the new one is installed.
  server.httpServer?.once('close', () => {
    debounce.cancel()
    void watcher.close()
  })
}

function installMiddleware(
  middleware: Connect.Server,
  runtime: ApiRuntime,
): void {
  middleware.use(async (request, response, next) => {
    try {
      if (!request.url?.startsWith('/api/')) {
        response.setHeader(
          'Set-Cookie',
          `tctbp_session=${runtime.sessionToken}; HttpOnly; SameSite=Strict; Path=/`,
        )
        next()
        return
      }
      const handler = createApiHandler(runtime)
      await handler(request, response)
    } catch (error) {
      next(error)
    }
  })
}

async function createRuntime(
  environment: NodeJS.ProcessEnv,
): Promise<ApiRuntime> {
  return createApiRuntime(
    await loadServiceConfig(environment),
    undefined,
    environment,
  )
}
