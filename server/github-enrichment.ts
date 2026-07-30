import { createHash } from 'node:crypto'
import type {
  GitHubObservation,
  GitHubRepositoryIdentity,
  RepositoryGitHubEvidence,
} from '../shared/github'
import { GITHUB_OBSERVATION_BASIS } from '../shared/github'
import type { GitHubConfig } from './config'
import type { GitHubProvider } from './github-provider'
import type { LocalGitInspector } from './local-git'
import type { RegisteredRepository } from './registry'

export interface GitHubOnlyRepository {
  id: string
  name: string
  evidence: GitHubObservation
}

export class GitHubEnrichmentService {
  constructor(
    readonly config: GitHubConfig,
    readonly inspector: LocalGitInspector,
    readonly provider: GitHubProvider,
  ) {}

  async forLocal(
    repository: RegisteredRepository,
    force = false,
  ): Promise<RepositoryGitHubEvidence> {
    if (!this.config.enabled) return disabledEvidence('disabled')
    let identity: GitHubRepositoryIdentity | null
    try {
      identity = await this.inspector.githubIdentity(repository.path)
    } catch {
      return disabledEvidence('not-mapped')
    }
    if (!identity) return disabledEvidence('not-mapped')
    return this.provider.observe(identity, force)
  }

  async githubOnly(
    mappedLocalNames: Set<string>,
    force = false,
  ): Promise<GitHubOnlyRepository[]> {
    if (!this.config.enabled) return []
    const names = this.config.repositories.filter(
      (fullName) => !mappedLocalNames.has(fullName.toLocaleLowerCase()),
    )
    return mapWithConcurrency(
      names,
      this.config.concurrency,
      async (fullName) => {
        const identity = configuredIdentity(fullName)
        return {
          id: remoteRepositoryId(identity.fullName),
          name: identity.name,
          evidence: await this.provider.observe(identity, force),
        }
      },
    )
  }
}

function configuredIdentity(fullName: string): GitHubRepositoryIdentity {
  const [owner, name] = fullName.split('/')
  return { owner, name, fullName }
}

function remoteRepositoryId(fullName: string): string {
  return createHash('sha256')
    .update(`github:${fullName.toLocaleLowerCase()}`)
    .digest('base64url')
    .slice(0, 24)
}

function disabledEvidence(
  status: 'disabled' | 'not-mapped',
): RepositoryGitHubEvidence {
  return {
    status,
    basis: GITHUB_OBSERVATION_BASIS,
    retrievedAt: null,
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex++
      results[index] = await mapper(values[index])
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker(),
  ))
  return results
}
