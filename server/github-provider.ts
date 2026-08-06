import type {
  GitHubBranch,
  GitHubCheckRun,
  GitHubIssue,
  GitHubObservation,
  GitHubProviderIssue,
  GitHubPullRequest,
  GitHubRelease,
  GitHubRepositoryIdentity,
  GitHubRepositoryObservation,
  GitHubSection,
  GitHubTag,
  GitHubWorkflowRun,
} from '../shared/github'
import { GITHUB_OBSERVATION_BASIS } from '../shared/github'
import type { GitHubConfig } from './config'
import { AdviserError, errorCode } from './errors'
import type { GitHubRestClient } from './github-client'

export class GitHubProvider {
  #cache = new Map<string, GitHubObservation>()
  #refreshing = new Map<string, Promise<GitHubObservation>>()

  constructor(
    readonly config: GitHubConfig,
    readonly client: GitHubRestClient,
    readonly now: () => Date = () => new Date(),
  ) {}

  async observe(
    identity: GitHubRepositoryIdentity,
    force = false,
  ): Promise<GitHubObservation> {
    const key = identity.fullName.toLocaleLowerCase()
    const cached = this.#cache.get(key)
    if (!force && cached && isFresh(
      cached.retrievedAt,
      this.config.cacheTtlMs,
      this.now(),
    )) return cached
    const active = this.#refreshing.get(key)
    if (active) return active
    const refresh = this.refresh(identity)
    this.#refreshing.set(key, refresh)
    try {
      const result = await refresh
      this.#cache.set(key, result)
      return result
    } finally {
      this.#refreshing.delete(key)
    }
  }

  private async refresh(
    identity: GitHubRepositoryIdentity,
  ): Promise<GitHubObservation> {
    const retrievedAt = this.now().toISOString()
    const root = repositoryPath(identity)
    try {
      const metadata = repositoryMetadata(await this.client.get(root))
      const sections = await Promise.all([
        section(() => this.client.get(`${root}/branches?per_page=100`), branches),
        section(() => this.client.get(`${root}/tags?per_page=100`), tags),
        section(() => this.client.get(`${root}/releases?per_page=20`), releases),
        section(
          () => this.client.get(`${root}/actions/runs?per_page=20`),
          workflowRuns,
        ),
        section(
          () => this.client.get(
            `${root}/commits/${encodeURIComponent(metadata.defaultBranch)}`
            + '/check-runs?per_page=20',
          ),
          checkRuns,
        ),
        section(
          () => this.client.get(`${root}/pulls?state=open&per_page=20`),
          pullRequests,
        ),
        section(
          () => this.client.get(`${root}/issues?state=open&per_page=100`),
          issues,
        ),
      ])
      const branchSection = sections[0] as GitHubSection<GitHubBranch>
      const defaultBranchSha = branchSection.items.find(
        (branch) => branch.name === metadata.defaultBranch,
      )?.sha ?? null
      return {
        status: 'available',
        basis: GITHUB_OBSERVATION_BASIS,
        retrievedAt,
        repository: { ...metadata, defaultBranchSha },
        branches: branchSection,
        tags: sections[1] as GitHubSection<GitHubTag>,
        releases: sections[2] as GitHubSection<GitHubRelease>,
        workflows: sections[3] as GitHubSection<GitHubWorkflowRun>,
        checks: sections[4] as GitHubSection<GitHubCheckRun>,
        pullRequests: sections[5] as GitHubSection<GitHubPullRequest>,
        issues: sections[6] as GitHubSection<GitHubIssue>,
      } satisfies GitHubRepositoryObservation
    } catch (error) {
      return {
        status: 'unavailable',
        basis: GITHUB_OBSERVATION_BASIS,
        retrievedAt,
        repository: { fullName: identity.fullName },
        error: providerIssue(error),
      }
    }
  }
}

function repositoryPath(identity: GitHubRepositoryIdentity): string {
  return `/repos/${encodeURIComponent(identity.owner)}/`
    + encodeURIComponent(identity.name)
}

async function section<T>(
  load: () => Promise<unknown>,
  parse: (value: unknown) => ParsedSection<T>,
): Promise<GitHubSection<T>> {
  try {
    const parsed = parse(await load())
    return {
      status: 'available',
      items: parsed.items,
      totalCount: parsed.totalCount,
      truncated: parsed.truncated,
      error: null,
    }
  } catch (error) {
    return {
      status: 'unavailable',
      items: [],
      totalCount: null,
      truncated: false,
      error: providerIssue(error),
    }
  }
}

interface ParsedSection<T> {
  items: T[]
  totalCount: number | null
  truncated: boolean
}

function repositoryMetadata(value: unknown):
GitHubRepositoryObservation['repository'] {
  const record = object(value)
  const visibility = string(record.visibility)
  if (!['public', 'private', 'internal'].includes(visibility)) invalid()
  return {
    fullName: string(record.full_name),
    htmlUrl: safeGitHubUrl(string(record.html_url)),
    defaultBranch: string(record.default_branch),
    defaultBranchSha: null,
    visibility: visibility as 'public' | 'private' | 'internal',
    archived: boolean(record.archived),
    pushedAt: nullableString(record.pushed_at),
  }
}

function branches(value: unknown): ParsedSection<GitHubBranch> {
  return arraySection(value, 100, (item) => {
    const record = object(item)
    return {
      name: string(record.name),
      sha: string(object(record.commit).sha),
      protected: boolean(record.protected),
    }
  })
}

function tags(value: unknown): ParsedSection<GitHubTag> {
  return arraySection(value, 100, (item) => {
    const record = object(item)
    return {
      name: string(record.name),
      sha: string(object(record.commit).sha),
    }
  })
}

function releases(value: unknown): ParsedSection<GitHubRelease> {
  return arraySection(value, 20, (item) => {
    const record = object(item)
    return {
      name: nullableString(record.name) || string(record.tag_name),
      tagName: string(record.tag_name),
      publishedAt: nullableString(record.published_at),
      draft: boolean(record.draft),
      prerelease: boolean(record.prerelease),
    }
  })
}

function workflowRuns(value: unknown): ParsedSection<GitHubWorkflowRun> {
  const record = object(value)
  const items = array(record.workflow_runs).map((item) => {
    const run = object(item)
    return {
      name: string(run.name),
      branch: nullableString(run.head_branch),
      sha: string(run.head_sha),
      status: string(run.status),
      conclusion: nullableString(run.conclusion),
      updatedAt: string(run.updated_at),
    }
  })
  return countedSection(items, number(record.total_count), 20)
}

function checkRuns(value: unknown): ParsedSection<GitHubCheckRun> {
  const record = object(value)
  const items = array(record.check_runs).map((item) => {
    const run = object(item)
    return {
      name: string(run.name),
      sha: string(run.head_sha),
      status: string(run.status),
      conclusion: nullableString(run.conclusion),
      completedAt: nullableString(run.completed_at),
    }
  })
  return countedSection(items, number(record.total_count), 20)
}

function pullRequests(value: unknown): ParsedSection<GitHubPullRequest> {
  return arraySection(value, 20, (item) => {
    const record = object(item)
    return {
      number: number(record.number),
      title: string(record.title),
      draft: boolean(record.draft),
      updatedAt: string(record.updated_at),
    }
  })
}

function issues(value: unknown): ParsedSection<GitHubIssue> {
  const issueRecords = array(value).map(object).filter(
    (record) => !('pull_request' in record),
  )
  const items = issueRecords.map((record) => ({
    number: number(record.number),
    title: string(record.title),
    updatedAt: string(record.updated_at),
  }))
  return {
    items,
    totalCount: items.length,
    truncated: issueRecords.length === 100,
  }
}

function arraySection<T>(
  value: unknown,
  limit: number,
  parse: (value: unknown) => T,
): ParsedSection<T> {
  const items = array(value).map(parse)
  return {
    items,
    totalCount: items.length,
    truncated: items.length === limit,
  }
}

function countedSection<T>(
  items: T[],
  totalCount: number,
  limit: number,
): ParsedSection<T> {
  return { items, totalCount, truncated: totalCount > limit }
}

function providerIssue(error: unknown): GitHubProviderIssue {
  return {
    code: errorCode(error),
    message: error instanceof AdviserError
      ? error.message
      : 'GitHub provider evidence is unavailable.',
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid()
  }
  return value as Record<string, unknown>
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid()
  return value as unknown[]
}

function string(value: unknown): string {
  if (typeof value !== 'string' || value === '') invalid()
  return value as string
}

function nullableString(value: unknown): string | null {
  if (value === null) return null
  return string(value)
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid()
  }
  return value as number
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid()
  return value as boolean
}

function safeGitHubUrl(value: string): string {
  const url = new URL(value)
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'github.com'
    || url.username
    || url.password
    || url.port
  ) invalid()
  return url.toString()
}

function invalid(): never {
  throw new Error('GitHub returned an unexpected response shape.')
}

function isFresh(value: string, ttlMs: number, now: Date): boolean {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && now.getTime() - timestamp <= ttlMs
}
