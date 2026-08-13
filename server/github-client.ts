import type { GitHubConfig } from './config'
import { AdviserError } from './errors'

const API_ROOT = 'https://api.github.com'
const API_VERSION = '2026-03-10'

export type GitHubFetch = typeof fetch

export interface GitHubUserIdentity {
  login: string | null
  name: string | null
}

export class GitHubRestClient {
  constructor(
    readonly config: GitHubConfig,
    readonly request: GitHubFetch = fetch,
  ) {}

  async get(path: string): Promise<unknown> {
    return (await this.requestJson(path)).body
  }

  /** Creates a repository under the authenticated account. */
  async createRepository(options: {
    name: string
    private: boolean
  }): Promise<void> {
    await this.requestJson('/user/repos', 'POST', {
      name: options.name,
      private: options.private,
      auto_init: false,
    })
  }

  /** True when the repository already exists (404-tolerant). */
  async repositoryExists(owner: string, name: string): Promise<boolean> {
    try {
      await this.requestJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      )
      return true
    } catch (error) {
      if (
        error instanceof AdviserError
        && error.code === 'github-repository-not-found'
      ) {
        return false
      }
      throw error
    }
  }

  /**
   * Authenticated user plus classic-PAT scopes from the x-oauth-scopes header.
   * Scopes are empty for fine-grained tokens (which do not advertise scopes).
   */
  async readUser(): Promise<{
    user: GitHubUserIdentity
    scopes: string[]
  }> {
    const { body, scopes } = await this.requestJson('/user')
    const user = (
      typeof body === 'object' && body !== null ? body : {}
    ) as Record<string, unknown>
    return {
      user: {
        login: typeof user.login === 'string' ? user.login : null,
        name: typeof user.name === 'string' ? user.name : null,
      },
      scopes,
    }
  }

  private async requestJson(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    payload?: unknown,
  ): Promise<{
    body: unknown
    scopes: string[]
  }> {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new AdviserError(
        'github-path-rejected',
        'GitHub API path was rejected.',
      )
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)
    try {
      const response = await this.request(`${API_ROOT}${path}`, {
        method,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          ...this.headers(),
          ...(payload !== undefined
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      })
      if (!response.ok) throw githubHttpError(response.status)
      const advertised = Number(response.headers.get('content-length'))
      if (
        Number.isFinite(advertised)
        && advertised > this.config.maxResponseBytes
      ) {
        throw responseLimitError()
      }
      const body = await readBoundedBody(
        response,
        this.config.maxResponseBytes,
      )
      let parsed: unknown
      try {
        parsed = JSON.parse(new TextDecoder().decode(body)) as unknown
      } catch {
        throw new AdviserError(
          'github-response-invalid',
          'GitHub returned an invalid JSON response.',
        )
      }
      const scopes = (response.headers.get('x-oauth-scopes') ?? '')
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean)
      return { body: parsed, scopes }
    } catch (error) {
      if (error instanceof AdviserError) throw error
      const timedOut = (
        error instanceof DOMException && error.name === 'AbortError'
      )
      throw new AdviserError(
        timedOut ? 'github-request-timeout' : 'github-request-failed',
        timedOut
          ? 'GitHub did not respond within the configured time limit.'
          : 'GitHub could not be reached.',
        { cause: error },
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  private headers(): HeadersInit {
    return {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'TCTBP-Adviser',
      'X-GitHub-Api-Version': API_VERSION,
      ...(this.config.token
        ? { Authorization: `Bearer ${this.config.token}` }
        : {}),
    }
  }
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximumBytes) {
        await reader.cancel()
        throw responseLimitError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function githubHttpError(status: number): AdviserError {
  const code = status === 401
    ? 'github-authentication-failed'
    : status === 403
      ? 'github-access-denied'
      : status === 404
        ? 'github-repository-not-found'
        : status === 429
          ? 'github-rate-limited'
          : 'github-http-failed'
  return new AdviserError(code, githubHttpMessage(code))
}

function githubHttpMessage(code: string): string {
  if (code === 'github-authentication-failed') {
    return 'GitHub authentication failed.'
  }
  if (code === 'github-access-denied') return 'GitHub access was denied.'
  if (code === 'github-repository-not-found') {
    return 'GitHub repository was not found or is not accessible.'
  }
  if (code === 'github-rate-limited') return 'GitHub rate limit was reached.'
  return 'GitHub returned an unsuccessful response.'
}

function responseLimitError(): AdviserError {
  return new AdviserError(
    'github-response-limit-exceeded',
    'GitHub response exceeded the configured size limit.',
  )
}
