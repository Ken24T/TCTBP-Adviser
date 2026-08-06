import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ActionerResult } from '../shared/actioner'

const execFileAsync = promisify(execFile)

export interface ShipProgress {
  (step: 'validate' | 'execute' | 'reinspect' | 'complete', detail?: string): void
}

export class ShipActioner {
  constructor(
    readonly productionBranch = 'main',
    readonly bump: 'patch' | 'minor' | 'major' = 'patch',
    readonly timeoutMs = 300_000,
    readonly maxOutputBytes = 2 * 1024 * 1024,
  ) {}

  async run(
    repositoryPath: string,
    branch: string | null,
    progress: ShipProgress,
  ): Promise<ActionerResult> {
    if (branch !== this.productionBranch) {
      throw new Error(`Ship requires the ${this.productionBranch} branch.`)
    }
    progress('validate', `Ship preflight passed for ${this.productionBranch}.`)
    progress('execute', `Running the TCTBP ship workflow with ${this.bump} bump.`)
    await this.command(repositoryPath, [
      'scripts/tctbp-run-ship.js',
      '--bump',
      this.bump,
      '--no-docs-impact',
      'Actioner ship',
      '--yes',
    ])
    progress('reinspect', 'Reading the resulting release tag and main branch state.')
    const commitSha = (await this.git(repositoryPath, ['rev-parse', this.productionBranch])).stdout.trim()
    const remote = (await this.git(repositoryPath, ['remote', 'get-url', 'origin']).catch(() => ({ stdout: '' }))).stdout.trim() || null
    const pushed = await this.isBranchPublished(repositoryPath, this.productionBranch, commitSha)
    const currentTag = (await this.git(repositoryPath, ['describe', '--tags', '--abbrev=0', this.productionBranch]).catch(() => ({ stdout: '' }))).stdout.trim() || null
    const status = await this.git(repositoryPath, ['status', '--porcelain'])
    const verifiedClean = status.stdout.trim().length === 0
    progress('complete', `Shipped ${this.productionBranch} at ${commitSha.slice(0, 12)}${currentTag ? ` with tag ${currentTag}` : ''}.`)
    return {
      workflowId: 'ship',
      commitSha,
      branch: this.productionBranch,
      pushed,
      remote,
      verifiedClean,
      summary: `Shipped ${this.productionBranch}${pushed ? ' and published to origin' : ''}${currentTag ? ` with tag ${currentTag}` : ''}.`,
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
