import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ActionerResult } from '../shared/actioner'

const execFileAsync = promisify(execFile)

export interface DeployProgress {
  (step: 'validate' | 'execute' | 'reinspect' | 'complete', detail?: string): void
}

export class DeployActioner {
  constructor(
    readonly timeoutMs = 180_000,
    readonly maxOutputBytes = 2 * 1024 * 1024,
  ) {}

  async run(
    repositoryPath: string,
    branch: string | null,
    progress: DeployProgress,
  ): Promise<ActionerResult> {
    if (branch !== 'development') {
      throw new Error('Development deployment requires the development branch.')
    }
    progress('validate', 'Deployment preflight passed for development.')
    progress('execute', 'Running the fixed TCTBP development deployment workflow.')
    await this.command(repositoryPath, [
      'scripts/tctbp-run-deploy.js',
      'dev',
      '--no-docs-impact',
      'Actioner deploy development',
    ])
    progress('reinspect', 'Reading the resulting development state.')
    const commitSha = (await this.git(repositoryPath, ['rev-parse', 'HEAD'])).stdout.trim()
    const status = await this.git(repositoryPath, ['status', '--porcelain'])
    const verifiedClean = status.stdout.trim().length === 0
    progress('complete', 'Development deployment workflow completed.')
    return {
      workflowId: 'deploy-development',
      commitSha,
      branch,
      pushed: null,
      remote: null,
      verifiedClean,
      summary: 'Development deployment workflow completed; inspect the target result.',
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
      timeout: 30_000,
      maxBuffer: this.maxOutputBytes,
      windowsHide: true,
    })
  }
}
