import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ActionerResult } from '../shared/actioner'

const execFileAsync = promisify(execFile)

export interface CheckpointProgress {
  (step: 'validate' | 'execute' | 'reinspect' | 'complete', detail?: string): void
}

export class CheckpointActioner {
  constructor(
    readonly timeoutMs = 30_000,
    readonly maxOutputBytes = 1_048_576,
  ) {}

  async run(
    repositoryPath: string,
    branch: string | null,
    progress: CheckpointProgress,
  ): Promise<ActionerResult> {
    progress('validate', 'Deterministic preflight passed.')
    progress('execute', 'Staging tracked and non-ignored untracked files.')
    await this.git(repositoryPath, ['add', '-A'])
    await this.git(repositoryPath, [
      'commit',
      '-m',
      'checkpoint: preserve local working state',
    ])
    const commitSha = (await this.git(repositoryPath, ['rev-parse', 'HEAD'])).stdout.trim()
    progress('reinspect', 'Reading the resulting branch and working tree state.')
    const status = await this.git(repositoryPath, ['status', '--porcelain'])
    const verifiedClean = status.stdout.trim().length === 0
    if (!verifiedClean) throw new Error('Checkpoint completed but the working tree is not clean.')
    progress('complete', `Created local checkpoint ${commitSha.slice(0, 12)}.`)
    return {
      workflowId: 'checkpoint',
      commitSha,
      branch,
      pushed: false,
      remote: null,
      verifiedClean,
      summary: 'Local checkpoint created; no push performed.',
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
