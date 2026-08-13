import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ActionerResult } from '../shared/actioner'
import { validateOriginUrl } from './origin-url'

const execFileAsync = promisify(execFile)

export interface AddOriginProgress {
  (step: 'validate' | 'execute' | 'reinspect' | 'complete', detail?: string): void
}

/**
 * Adds an origin remote to a repository that has none. A purely local git
 * mutation — no commit, push, or external network action — so a remote-less
 * repository can be connected and then published through the normal flow.
 */
export class OriginActioner {
  constructor(
    readonly timeoutMs = 60_000,
    readonly maxOutputBytes = 1_048_576,
  ) {}

  async run(
    repositoryPath: string,
    url: string,
    progress: AddOriginProgress,
  ): Promise<ActionerResult> {
    const origin = validateOriginUrl(url)
    await this.connectOrigin(repositoryPath, origin, progress)
    progress('complete', `Origin remote configured at ${origin}.`)
    return {
      workflowId: 'add-origin',
      commitSha: null,
      branch: null,
      pushed: false,
      remote: origin,
      verifiedClean: true,
      summary: 'Origin remote added; publish the current branch to back it up.',
    }
  }

  /**
   * Adds and verifies an origin remote. Shared with the GitHub-created origin
   * flow so both modes use the identical local git mutation.
   */
  async connectOrigin(
    repositoryPath: string,
    origin: string,
    progress: AddOriginProgress,
  ): Promise<void> {
    progress('validate', 'Checking for an existing origin remote.')
    const existing = await this.originUrl(repositoryPath)
    if (existing) throw new Error('An origin remote is already configured.')
    progress('execute', `Adding origin remote ${origin}.`)
    await this.git(repositoryPath, ['remote', 'add', 'origin', origin])
    progress('reinspect', 'Verifying the configured origin remote.')
    const configured = await this.originUrl(repositoryPath)
    if (configured !== origin) {
      throw new Error('Origin remote verification did not match the requested URL.')
    }
  }

  private async originUrl(repositoryPath: string): Promise<string | null> {
    try {
      const result = await this.git(
        repositoryPath,
        ['remote', 'get-url', 'origin'],
      )
      return result.stdout.trim() || null
    } catch {
      return null
    }
  }

  private async git(repositoryPath: string, args: string[]) {
    return execFileAsync('git', ['-C', repositoryPath, ...args], {
      timeout: this.timeoutMs,
      maxBuffer: this.maxOutputBytes,
      windowsHide: true,
    })
  }
}
