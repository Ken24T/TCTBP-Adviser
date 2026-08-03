import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ActionerResult } from '../shared/actioner'

const execFileAsync = promisify(execFile)

export interface PublishProgress {
  (step: 'validate' | 'execute' | 'reinspect' | 'complete', detail?: string): void
}

export class PublishActioner {
  constructor(
    readonly timeoutMs = 60_000,
    readonly maxOutputBytes = 1_048_576,
  ) {}

  async run(
    repositoryPath: string,
    branch: string | null,
    progress: PublishProgress,
  ): Promise<ActionerResult> {
    if (!branch || branch === 'HEAD') throw new Error('Publish requires an attached branch.')
    progress('validate', 'Checking origin and clean branch state.')
    const remote = (await this.git(repositoryPath, ['remote', 'get-url', 'origin'])).stdout.trim()
    if (!remote) throw new Error('Publish requires an origin remote.')
    const status = await this.git(repositoryPath, ['status', '--porcelain'])
    if (status.stdout.trim()) throw new Error('Publish requires a clean working tree.')
    const commitSha = (await this.git(repositoryPath, ['rev-parse', 'HEAD'])).stdout.trim()
    progress('execute', `Publishing ${branch} to origin.`)
    await this.git(repositoryPath, ['push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`])
    progress('reinspect', 'Verifying the remote branch commit.')
    const remoteSha = (await this.git(repositoryPath, ['ls-remote', 'origin', `refs/heads/${branch}`])).stdout.trim().split(/\s+/)[0]
    if (remoteSha !== commitSha) throw new Error('Remote verification did not match the local commit.')
    progress('complete', `Published ${branch} at ${commitSha.slice(0, 12)}.`)
    return {
      workflowId: 'publish',
      commitSha,
      branch,
      pushed: true,
      remote,
      verifiedClean: true,
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
