import { createServer, type Server } from 'node:http'
import {
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createApiHandler, createApiRuntime } from './api'
import type { ServiceConfig } from './config'
import {
  createGitRepository,
  createTemporaryDirectory,
} from '../test/helpers'

const servers: Server[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(
    (server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  ))
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('same-origin inspection API', () => {
  it('requires the per-launch session token', async () => {
    const running = await startApi()
    const response = await fetch(`${running.url}/api/health`)

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: { code: 'session-token-invalid' },
    })
  })

  it('rejects a cross-origin request even with a valid token', async () => {
    const running = await startApi()
    const response = await fetch(`${running.url}/api/health`, {
      headers: {
        Origin: 'http://evil.example',
        'X-TCTBP-Session': running.token,
      },
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: { code: 'request-origin-rejected' },
    })
  })

  it('lists only an opaque repository identity and accepts no path', async () => {
    const running = await startApi()
    const response = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const body = await response.json() as {
      repositories: Array<{ id: string; name: string }>
    }

    expect(response.status).toBe(200)
    expect(body.repositories).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain(running.repository)
    expect(body.repositories[0].id).toMatch(/^[A-Za-z0-9_-]{24}$/)
  })

  it('returns a read-only observation for the registered repository', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const id = list.repositories[0].id
    const response = await authorisedFetch(
      `${running.url}/api/repositories/${id}/inspect`,
      running,
      { method: 'POST' },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      repository: { id },
      basis: 'local-working-copy-and-local-tracking-refs',
      fetchPerformed: false,
      head: { branch: 'development' },
    })
  })

  it('rejects browser-supplied inspection input', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const response = await authorisedFetch(
      `${running.url}/api/repositories/${list.repositories[0].id}/inspect`,
      running,
      {
        method: 'POST',
        body: JSON.stringify({
          path: '/tmp/other',
          command: 'git fetch',
        }),
      },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: 'request-body-rejected' },
    })
  })

  it('returns a deterministic recommendation with evidence and freshness', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const response = await authorisedFetch(
      `${running.url}/api/repositories/${list.repositories[0].id}/recommendation`,
      running,
      {
        method: 'POST',
        body: JSON.stringify({ intent: 'none' }),
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      disposition: 'action',
      primaryAction: 'checkpoint',
      trigger: 'checkpoint please',
      confidence: 'deterministic',
      freshness: {
        stale: false,
        basis: 'local-working-copy-and-local-tracking-refs',
      },
    })
    expect(body.evidence.length).toBeGreaterThan(0)
    expect(body.observationIds).toHaveLength(1)
  })

  it('rejects arbitrary recommendation fields and unsupported intents', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const endpoint =
      `${running.url}/api/repositories/${list.repositories[0].id}/recommendation`
    const arbitrary = await authorisedFetch(endpoint, running, {
      method: 'POST',
      body: JSON.stringify({
        intent: 'none',
        path: '/tmp/other',
        command: 'git fetch',
      }),
    })
    const unsupported = await authorisedFetch(endpoint, running, {
      method: 'POST',
      body: JSON.stringify({ intent: 'deploy-production' }),
    })

    expect(arbitrary.status).toBe(400)
    expect(await arbitrary.json()).toMatchObject({
      error: { code: 'request-body-invalid' },
    })
    expect(unsupported.status).toBe(400)
    expect(await unsupported.json()).toMatchObject({
      error: { code: 'request-intent-invalid' },
    })
  })
})

interface RunningApi {
  url: string
  token: string
  repository: string
}

async function startApi(): Promise<RunningApi> {
  const root = await createTemporaryDirectory()
  temporaryDirectories.push(root)
  const repository = await createGitRepository(root)
  const profileDirectory = path.join(repository, '.github')
  await mkdir(profileDirectory)
  await writeFile(
    path.join(profileDirectory, 'TCTBP.json'),
    JSON.stringify({
      schemaVersion: 11,
      project: { name: 'repository' },
      adviserContract: {
        major: 1,
        minor: 0,
        capabilities: [
          'inspection.local-v1',
          'workflow-catalogue.core-v1',
          'reason-codes.core-v1',
        ],
      },
      adviserVocabulary: {
        workflowIds: [
          'status',
          'checkpoint',
          'publish',
          'resume',
          'handover',
        ],
      },
    }),
  )
  const config: ServiceConfig = {
    allowedRoot: root,
    repositoryPath: repository,
    repositoryName: 'repository',
    commandTimeoutMs: 3_000,
    commandMaxOutputBytes: 1024 * 1024,
  }
  const token = 'test-session-token'
  const runtime = createApiRuntime(config, token)
  const server = createServer(createApiHandler(runtime))
  servers.push(server)
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Test API did not bind to a TCP port.')
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    token,
    repository,
  }
}

function authorisedFetch(
  url: string,
  running: RunningApi,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      'X-TCTBP-Session': running.token,
    },
  })
}
