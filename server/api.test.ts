import { afterEach, describe, expect, it } from 'vitest'
import {
  authorisedFetch,
  cleanupApis,
  startApi,
} from '../test/api-harness'

afterEach(async () => {
  await cleanupApis()
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

  it('returns one atomic repository-detail observation and recommendation', async () => {
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
      `${running.url}/api/repositories/${id}/detail`,
      running,
      {
        method: 'POST',
        body: JSON.stringify({ intent: 'none' }),
      },
    )
    const body = await response.json() as {
      observation: {
        observedAt: string
        tctbp: {
          projectDescription: string
          branchModel: { strategy: string }
          qualityGates: Array<{ id: string; configured: boolean }>
        }
      }
      recommendation: {
        observationIds: string[]
        freshness: { observedAt: string }
      }
      github: { status: string; retrievedAt: string | null }
    }

    expect(response.status).toBe(200)
    expect(body.recommendation.freshness.observedAt)
      .toBe(body.observation.observedAt)
    expect(body.recommendation.observationIds[0])
      .toContain(body.observation.observedAt)
    expect(body.observation.tctbp).toMatchObject({
      projectDescription: 'A repository under test.',
      branchModel: { strategy: 'staged' },
    })
    expect(body.observation.tctbp.qualityGates).toContainEqual({
      id: 'test',
      configured: true,
      requiredBeforeShip: true,
    })
    expect(body.github).toEqual({
      status: 'disabled',
      basis: 'github-rest-api',
      retrievedAt: null,
    })
  })

  it('returns cached portfolio summaries including non-TCTBP repositories', async () => {
    const running = await startApi(true)
    const first = await authorisedFetch(
      `${running.url}/api/portfolio`,
      running,
    )
    const second = await authorisedFetch(
      `${running.url}/api/portfolio`,
      running,
    )
    const firstBody = await first.json() as {
      cache: { status: string }
      discovery: { repositoryCount: number; rootCount: number }
      github: {
        enabled: boolean
        localMappings: number
        githubOnly: number
        unavailable: number
      }
      repositories: Array<{
        name: string
        tctbp: { installed: boolean } | null
        recommendation: { primaryAction: string | null } | null
      }>
    }
    const secondBody = await second.json() as {
      cache: { status: string }
    }

    expect(first.status).toBe(200)
    expect(firstBody.cache.status).toBe('refreshed')
    expect(secondBody.cache.status).toBe('fresh')
    expect(firstBody.discovery).toMatchObject({
      repositoryCount: 2,
      rootCount: 1,
    })
    expect(firstBody.github).toEqual({
      enabled: false,
      localMappings: 0,
      githubOnly: 0,
      unavailable: 0,
    })
    expect(firstBody.repositories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'plain-repository',
        tctbp: expect.objectContaining({ installed: false }),
        recommendation: expect.objectContaining({
          primaryAction: null,
        }),
      }),
      expect.objectContaining({
        name: 'repository',
        tctbp: expect.objectContaining({ installed: true }),
      }),
    ]))
  })

  it('refreshes discovery explicitly and rejects refresh input', async () => {
    const running = await startApi()
    const refreshed = await authorisedFetch(
      `${running.url}/api/repositories/refresh`,
      running,
      { method: 'POST' },
    )
    const rejected = await authorisedFetch(
      `${running.url}/api/repositories/refresh`,
      running,
      {
        method: 'POST',
        body: JSON.stringify({ path: '/tmp/other' }),
      },
    )

    expect(refreshed.status).toBe(200)
    expect(await refreshed.json()).toMatchObject({
      cache: { status: 'refreshed', ageMs: 0 },
      discovery: { repositoryCount: 1 },
    })
    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toMatchObject({
      error: { code: 'request-body-rejected' },
    })
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
