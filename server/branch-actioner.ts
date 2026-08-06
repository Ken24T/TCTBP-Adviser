import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ActionerResult } from '../shared/actioner'

const execFileAsync = promisify(execFile)

export interface BranchProgress {
  (step: 'validate' | 'execute' | 'reinspect' | 'complete', detail?: string): void
}

export class BranchActioner {
  constructor(
    readonly timeoutMs = 60_000,
    readonly maxOutputBytes = 1_048_576,
  ) {}

  async run(
    repositoryPath: string,
    sourceBranch: string | null,
    progress: BranchProgress,
  ): Promise<ActionerResult> {
    if (!sourceBranch || sourceBranch === 'HEAD') throw new Error('Branch activation requires an attached source branch.')
    progress('validate', `Preparing development from ${sourceBranch}.`)
    const status = await this.git(repositoryPath, ['status', '--porcelain'])
    if (status.stdout.trim()) throw new Error('Branch activation requires a clean working tree.')
    progress('execute', 'Creating and switching to development.')
    await this.git(repositoryPath, ['switch', '-c', 'development'])
    progress('reinspect', 'Reading the resulting development branch.')
    const commitSha = (await this.git(repositoryPath, ['rev-parse', 'HEAD'])).stdout.trim()
    progress('complete', `Development branch created at ${commitSha.slice(0, 12)}.`)
    return {
      workflowId: 'branch-development',
      commitSha,
      branch: 'development',
      pushed: false,
      remote: null,
      verifiedClean: true,
      summary: 'Development branch created locally; publish it before deployment.',
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
