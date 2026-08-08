import type {
  Connect,
  Plugin,
  PreviewServer,
  ViteDevServer,
} from 'vite'
import { createApiHandler, createApiRuntime } from './api'
import { loadServiceConfig } from './config'
import type { ApiRuntime } from './api'

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
    },
    async configurePreviewServer(server: PreviewServer) {
      installMiddleware(
        server.middlewares,
        await createRuntime(environment),
      )
    },
  }
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
