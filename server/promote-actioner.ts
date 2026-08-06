import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ActionerResult } from '../shared/actioner'

const execFileAsync = promisify(execFile)

export interface PromoteProgress {
  (step: 'validate' | 'execute' | 'reinspect' | 'complete', detail?: string): void
}

export class PromoteActioner {
  constructor(
    readonly target = 'review',
    readonly sourceBranch = 'development',
    readonly timeoutMs = 300_000,
    readonly maxOutputBytes = 2 * 1024 * 1024,
  ) {}

  async run(
    repositoryPath: string,
    branch: string | null,
    progress: PromoteProgress,
  ): Promise<ActionerResult> {
    if (branch !== this.sourceBranch) {
      throw new Error(`Promote ${this.target} requires the ${this.sourceBranch} branch.`)
    }
    progress('validate', `Promotion preflight passed for ${this.sourceBranch} → ${this.target}.`)
    progress('execute', `Running the TCTBP promote ${this.target} workflow.`)
    await this.command(repositoryPath, [
      'scripts/tctbp-run-promote.js',
      this.target,
      '--no-docs-impact',
      `Actioner promote ${this.target}`,
    ])
    progress('reinspect', `Reading the resulting ${this.target} branch state.`)
    const commitSha = (await this.git(repositoryPath, ['rev-parse', this.target])).stdout.trim()
    const remote = (await this.git(repositoryPath, ['remote', 'get-url', 'origin']).catch(() => ({ stdout: '' }))).stdout.trim() || null
    const pushed = await this.isBranchPublished(repositoryPath, this.target, commitSha)
    const status = await this.git(repositoryPath, ['status', '--porcelain'])
    const verifiedClean = status.stdout.trim().length === 0
    progress('complete', `Promoted ${this.sourceBranch} to ${this.target} at ${commitSha.slice(0, 12)}.`)
    return {
      workflowId: 'promote-review',
      commitSha,
      branch: this.target,
      pushed,
      remote,
      verifiedClean,
      summary: `Promoted ${this.sourceBranch} to ${this.target}${pushed ? ' and published to origin' : ''}.`,
    }
  }

  private async isBranchPublished(
    repositoryPath: string,
    branchName: string,
    localSha: string,
  ): Promise<boolean> {
    try {
      const remoteSha = (await this.git(repositoryPath, ['ls-remote', 'origin', `refs/heads/${branchName}`])).stdout.trim().split(/\s+/)[0]
      return remoteSha === localSha
    } catch {
      return false
    }
  }

  private async command(repositoryPath: string, args: string[]) {
    return execFileAsync(process.execPath, args, {
      cwd: repositoryPath,
      timeout: this.timeoutMs,
      maxBuffer: this.maxOutputBytes,
      windowsHide: true,
    })
  }

  private async git(repositoryPath: string, args: string[]) {
    return execFileAsync('git', ['-C', repositoryPath, ...args], {
      timeout: this.timeoutMs,
      maxBuffer: this.maxOutputBytes,
      windowsHide: true,
    })
  }
}
