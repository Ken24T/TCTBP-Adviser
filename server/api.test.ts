import { rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  authorisedFetch,
  cleanupApis,
  startApi,
} from '../test/api-harness'
import { createTemporaryDirectory } from '../test/helpers'
import type { GitHubRestClient } from './github-client'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await cleanupApis()
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

  it('refreshes a single registered repository into a portfolio snapshot', async () => {
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
      `${running.url}/api/repositories/${id}/refresh`,
      running,
      { method: 'POST' },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.repositories).toHaveLength(1)
    expect(body.repositories[0]).toMatchObject({ id, source: 'local' })
    expect(body.cache.status).toBe('refreshed')
  })

  it('rejects refreshing an unregistered repository', async () => {
    const running = await startApi()
    const response = await authorisedFetch(
      `${running.url}/api/repositories/${'Z'.repeat(24)}/refresh`,
      running,
      { method: 'POST' },
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      error: { code: 'repository-not-found' },
    })
  })

  it('surfaces GitHub access status and new-repo visibility in settings', async () => {
    const settingsDirectory = await createTemporaryDirectory()
    temporaryDirectories.push(settingsDirectory)
    const running = await startApi(false, {
      TCTBP_ADVISER_SETTINGS_FILE: path.join(settingsDirectory, 'app-settings.json'),
    })
    const response = await authorisedFetch(
      `${running.url}/api/settings`,
      running,
    )
    const body = await response.json() as {
      githubNewRepositoryVisibility: { effective: string; persisted: unknown }
      githubAccess: { configured: boolean; authenticated: boolean }
    }

    expect(response.status).toBe(200)
    expect(body.githubNewRepositoryVisibility).toMatchObject({
      effective: 'private',
      persisted: null,
    })
    expect(body.githubAccess).toMatchObject({
      configured: false,
      authenticated: false,
    })

    const testResponse = await authorisedFetch(
      `${running.url}/api/settings/github/test`,
      running,
      { method: 'POST' },
    )
    expect(testResponse.status).toBe(200)
    expect(await testResponse.json()).toMatchObject({
      configured: false,
      authenticated: false,
    })
  })

  it('adds an origin remote to a remote-less repository', async () => {
    const running = await startApi(true)
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string; name: string }>
    }
    const plain = list.repositories.find(
      (repository) => repository.name === 'plain-repository',
    )
    expect(plain).toBeDefined()

    const response = await authorisedFetch(
      `${running.url}/api/repositories/${plain!.id}/actions/add-origin`,
      running,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'add-origin',
          confirm: true,
          url: 'https://github.com/Ken24T/plain.git',
        }),
      },
    )

    expect(response.status).toBe(202)
    const started = await response.json() as { jobId: string; status: string }
    expect(started.status).toBe('started')

    const deadline = Date.now() + 5_000
    let job: { status: string; result?: { remote?: string } } | null = null
    while (Date.now() < deadline) {
      const jobResponse = await authorisedFetch(
        `${running.url}/api/repositories/${plain!.id}/action-jobs/${started.jobId}`,
        running,
      )
      job = await jobResponse.json() as { status: string; result?: { remote?: string } }
      if (job.status === 'completed' || job.status === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect(job?.status).toBe('completed')
    expect(job?.result?.remote).toBe('https://github.com/Ken24T/plain.git')
  })

  it('serves the portfolio from cache after an action (targeted refresh)', async () => {
    const running = await startApi(true)
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string; name: string }>
    }
    const plain = list.repositories.find(
      (repository) => repository.name === 'plain-repository',
    )
    expect(plain).toBeDefined()

    // Prime the portfolio cache.
    const primed = await authorisedFetch(`${running.url}/api/portfolio`, running)
    expect(await primed.json()).toMatchObject({
      cache: { status: 'refreshed' },
    })

    const response = await authorisedFetch(
      `${running.url}/api/repositories/${plain!.id}/actions/add-origin`,
      running,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'add-origin',
          confirm: true,
          url: 'https://github.com/Ken24T/plain.git',
        }),
      },
    )
    expect(response.status).toBe(202)
    const started = await response.json() as { jobId: string }

    const deadline = Date.now() + 5_000
    let job: { status: string } | null = null
    while (Date.now() < deadline) {
      const jobResponse = await authorisedFetch(
        `${running.url}/api/repositories/${plain!.id}/action-jobs/${started.jobId}`,
        running,
      )
      job = await jobResponse.json() as { status: string }
      if (job.status === 'completed' || job.status === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(job?.status).toBe('completed')

    // The mutation refreshes only the affected repo into the cache, so the
    // next read is served fresh instead of forcing a full re-inspection.
    const portfolioResponse = await authorisedFetch(
      `${running.url}/api/portfolio`,
      running,
    )
    const portfolio = await portfolioResponse.json() as {
      cache: { status: string }
    }
    expect(portfolio.cache.status).toBe('fresh')
  })

  it('rejects an invalid add-origin URL without starting a job', async () => {
    const running = await startApi(true)
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string; name: string }>
    }
    const plain = list.repositories.find(
      (repository) => repository.name === 'plain-repository',
    )
    expect(plain).toBeDefined()

    const response = await authorisedFetch(
      `${running.url}/api/repositories/${plain!.id}/actions/add-origin`,
      running,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'add-origin',
          confirm: true,
          url: 'file:///etc/passwd',
        }),
      },
    )

    expect(response.status).toBe(202)
    const started = await response.json() as { jobId: string }
    const deadline = Date.now() + 5_000
    let job: { status: string; error?: string } | null = null
    while (Date.now() < deadline) {
      const jobResponse = await authorisedFetch(
        `${running.url}/api/repositories/${plain!.id}/action-jobs/${started.jobId}`,
        running,
      )
      job = await jobResponse.json() as { status: string; error?: string }
      if (job.status === 'completed' || job.status === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect(job?.status).toBe('failed')
    expect(job?.error).toContain('http, https, ssh, or git')
  })

  it('creates a GitHub repository and connects origin on a remote-less repository', async () => {
    const client = {
      readUser: async () => ({
        user: { login: 'Ken24T', name: 'Ken' },
        scopes: ['repo'],
      }),
      repositoryExists: async () => false,
      createRepository: async () => undefined,
    } as unknown as GitHubRestClient
    const running = await startApi(true, undefined, client)
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string; name: string }>
    }
    const plain = list.repositories.find(
      (repository) => repository.name === 'plain-repository',
    )
    expect(plain).toBeDefined()

    const response = await authorisedFetch(
      `${running.url}/api/repositories/${plain!.id}/actions/create-origin`,
      running,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'create-origin',
          confirm: true,
          name: 'adviser-route-test',
          visibility: 'private',
        }),
      },
    )

    expect(response.status).toBe(202)
    const started = await response.json() as { jobId: string; status: string }
    expect(started.status).toBe('started')

    const deadline = Date.now() + 5_000
    let job: { status: string; result?: { remote?: string } } | null = null
    while (Date.now() < deadline) {
      const jobResponse = await authorisedFetch(
        `${running.url}/api/repositories/${plain!.id}/action-jobs/${started.jobId}`,
        running,
      )
      job = await jobResponse.json() as { status: string; result?: { remote?: string } }
      if (job.status === 'completed' || job.status === 'failed') break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect(job?.status).toBe('completed')
    expect(job?.result?.remote).toBe('https://github.com/Ken24T/adviser-route-test.git')
  })

  it('rejects an invalid create-origin request without starting a job', async () => {
    const client = {
      readUser: async () => ({
        user: { login: 'Ken24T', name: 'Ken' },
        scopes: ['repo'],
      }),
      repositoryExists: async () => false,
      createRepository: async () => undefined,
    } as unknown as GitHubRestClient
    const running = await startApi(true, undefined, client)
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const plain = list.repositories[0]

    const response = await authorisedFetch(
      `${running.url}/api/repositories/${plain.id}/actions/create-origin`,
      running,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: 'create-origin',
          confirm: true,
          name: '',
          visibility: 'private',
        }),
      },
    )

    expect(response.status).toBe(400)
  })

  it('returns a read-only upgrade plan without configured canonical source', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const response = await authorisedFetch(
      `${running.url}/api/repositories/${list.repositories[0].id}/tctbp-upgrade-plan`,
      running,
      { method: 'POST' },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      source: {
        state: 'not-configured',
        managedFileCount: 0,
      },
      drift: {
        files: [],
      },
    })
  })

  it('returns a disabled Jasper review without configured AI settings', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const response = await authorisedFetch(
      `${running.url}/api/repositories/${list.repositories[0].id}/tctbp-upgrade-review`,
      running,
      { method: 'POST' },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'disabled',
      provider: 'openai-compatible',
    })
  })

  it('requires explicit confirmation for TCTBP apply requests', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const response = await authorisedFetch(
      `${running.url}/api/repositories/${list.repositories[0].id}/tctbp-apply`,
      running,
      {
        method: 'POST',
        body: JSON.stringify({
          confirm: false,
          planFingerprint: 'a'.repeat(64),
          mode: 'additions-only',
          approvedPaths: [],
          approvedDeletionPaths: [],
          confirmDeletions: false,
        }),
      },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: 'request-confirmation-required' },
    })
  })

  it('maps a cleanup with no leftover upgrade branch to a 409 conflict', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const response = await authorisedFetch(
      `${running.url}/api/repositories/${list.repositories[0].id}/tctbp-cleanup`,
      running,
      { method: 'POST' },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: { code: 'upgrade-cleanup-unavailable' },
    })
  })

  it('maps a merge with no upgrade branch to a 409 conflict', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const response = await authorisedFetch(
      `${running.url}/api/repositories/${list.repositories[0].id}/tctbp-merge`,
      running,
      { method: 'POST' },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: { code: 'upgrade-merge-unavailable' },
    })
  })

  it('maps a stale or unavailable Jasper review to a 409 conflict', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const response = await authorisedFetch(
      `${running.url}/api/repositories/${list.repositories[0].id}/tctbp-apply`,
      running,
      {
        method: 'POST',
        body: JSON.stringify({
          confirm: true,
          aiReviewId: 'missing-review',
          aiReviewAcknowledged: true,
          planFingerprint: 'a'.repeat(64),
          mode: 'additions-only',
          approvedPaths: [],
          approvedDeletionPaths: [],
          confirmDeletions: false,
        }),
      },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: { code: 'ai-review-stale-or-unavailable' },
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

  it('separates state advice from an intent plan in one observation', async () => {
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
        body: JSON.stringify({ intent: 'preserve-and-publish' }),
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
        intent: string
        observationIds: string[]
        freshness: { observedAt: string }
      }
      intentPlan: {
        source: string
        intent: string
        steps: Array<{ id: string }>
      }
      reference: {
        branchWorkflow: { strategy: string }
        workflows: Array<{ id: string }>
      }
      github: { status: string; retrievedAt: string | null }
      directoryName: string
    }

    expect(response.status).toBe(200)
    expect(body.directoryName).toBe('repository')
    expect(body.recommendation.freshness.observedAt)
      .toBe(body.observation.observedAt)
    expect(body.recommendation.observationIds[0])
      .toContain(body.observation.observedAt)
    expect(body.recommendation.intent).toBe('none')
    expect(body.intentPlan).toMatchObject({
      source: 'user-intent',
      intent: 'preserve-and-publish',
    })
    expect(body.intentPlan.steps.map((step) => step.id)).toEqual([
      'status',
      'checkpoint',
      'publish',
    ])
    expect(body.reference.branchWorkflow.strategy).toBe('staged')
    expect(body.reference.workflows.length).toBeGreaterThan(0)
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

  it('exposes pinned reference and path-free operational diagnostics', async () => {
    const running = await startApi()
    const listResponse = await authorisedFetch(
      `${running.url}/api/repositories`,
      running,
    )
    const list = await listResponse.json() as {
      repositories: Array<{ id: string }>
    }
    const id = list.repositories[0].id
    await authorisedFetch(
      `${running.url}/api/repositories/${id}/inspect`,
      running,
      { method: 'POST' },
    )

    const [catalogue, triggers, diagnostics, configuration] = await Promise.all([
      authorisedFetch(`${running.url}/api/catalogue`, running),
      authorisedFetch(`${running.url}/api/catalogue/triggers`, running),
      authorisedFetch(
        `${running.url}/api/diagnostics/inspections`,
        running,
      ),
      authorisedFetch(`${running.url}/api/configuration/export`, running),
    ])
    const catalogueBody = await catalogue.json() as {
      contract: { capability: string }
      workflows: unknown[]
      guardrails: unknown[]
    }
    const triggersBody = await triggers.json() as {
      triggers: Array<{ trigger: string; workflowId: string }>
    }
    const diagnosticsBody = await diagnostics.json() as {
      entries: Array<{ repositoryId: string; outcome: string }>
    }
    const configurationBody = await configuration.json()
    const serialised = JSON.stringify({
      diagnosticsBody,
      configurationBody,
    })

    expect(catalogueBody).toMatchObject({
      contract: { capability: 'workflow-catalogue.core-v1' },
    })
    expect(catalogueBody.workflows.length).toBeGreaterThan(0)
    expect(catalogueBody.guardrails.length).toBeGreaterThan(0)
    expect(triggersBody.triggers).toContainEqual({
      trigger: 'checkpoint please',
      workflowId: 'checkpoint',
    })
    expect(diagnosticsBody.entries).toContainEqual(expect.objectContaining({
      repositoryId: id,
      outcome: 'success',
    }))
    expect(configurationBody).toMatchObject({
      discovery: { repositoryRootCount: 1 },
      omissions: { repositoryPaths: true, githubToken: true },
    })
    expect(serialised).not.toContain(running.repository)
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
