import type { ActionerResult } from '../shared/actioner'
import { AdviserError } from './errors'
import { GitHubRestClient } from './github-client'
import { OriginActioner, type AddOriginProgress } from './origin-actioner'

export interface CreateGithubOriginOptions {
  name: string
  visibility: 'private' | 'public'
}

/** Validates a GitHub repository name (1-100 alphanumeric, inner _ . -). */
export function validateRepositoryName(candidate: string): string {
  const value = candidate.trim()
  if (
    !value
    || value.length > 100
    || value.includes('..')
    || !/^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/.test(value)
  ) {
    throw new AdviserError(
      'origin-name-invalid',
      'Repository name must be 1-100 alphanumeric characters, with hyphens, underscores, or dots between.',
    )
  }
  return value
}

/**
 * Creates a GitHub repository under the authenticated account and connects it
 * as origin (Mode B). Reuses the local origin-connect step from OriginActioner
 * so both modes perform the identical git mutation. Nothing is pushed — the
 * user publishes afterwards through the normal flow.
 */
export class CreateGithubOriginActioner {
  constructor(
    readonly client: GitHubRestClient,
    readonly timeoutMs = 60_000,
    readonly maxOutputBytes = 1_048_576,
  ) {}

  async run(
    repositoryPath: string,
    options: CreateGithubOriginOptions,
    progress: AddOriginProgress,
  ): Promise<ActionerResult> {
    const name = validateRepositoryName(options.name)
    const visibility = options.visibility === 'public' ? 'public' : 'private'
    progress('validate', 'Checking GitHub access and repository availability.')
    const { user } = await this.client.readUser()
    if (!user.login) {
      throw new Error('GitHub account could not be resolved.')
    }
    const owner = user.login
    const exists = await this.client.repositoryExists(owner, name)
    progress(
      'execute',
      exists
        ? `Attaching origin to existing ${owner}/${name}.`
        : `Creating ${visibility} repository ${owner}/${name}.`,
    )
    if (!exists) {
      await this.client.createRepository({
        name,
        private: visibility === 'private',
      })
    }
    const url = `https://github.com/${owner}/${name}.git`
    await new OriginActioner(this.timeoutMs, this.maxOutputBytes)
      .connectOrigin(repositoryPath, url, progress)
    progress(
      'complete',
      exists
        ? `Attached origin to ${owner}/${name}.`
        : `Created ${visibility} ${owner}/${name} and connected origin.`,
    )
    return {
      workflowId: 'create-origin',
      commitSha: null,
      branch: null,
      pushed: false,
      remote: url,
      verifiedClean: true,
      summary: exists
        ? `Attached origin to the existing GitHub repository ${owner}/${name}.`
        : `Created ${visibility} repository ${owner}/${name} and connected origin.`,
    }
  }
}
