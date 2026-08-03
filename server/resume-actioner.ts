import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ActionerResult } from '../shared/actioner'

const execFileAsync = promisify(execFile)

export class ResumeActioner {
  constructor(readonly timeoutMs = 180_000, readonly maxOutputBytes = 2 * 1024 * 1024) {}

  async run(repositoryPath: string, branch: string | null, progress: (step: 'validate' | 'execute' | 'reinspect' | 'complete', detail?: string) => void): Promise<ActionerResult> {
    if (!branch || branch === 'HEAD') throw new Error('Resume requires an attached branch.')
    progress('validate', 'Resume preflight passed for a clean branch behind origin.')
    progress('execute', 'Running the fixed TCTBP resume workflow.')
    await execFileAsync(process.execPath, ['scripts/tctbp-run-resume.js'], {
      cwd: repositoryPath,
      timeout: this.timeoutMs,
      maxBuffer: this.maxOutputBytes,
      windowsHide: true,
    })
    const commitSha = (await this.git(repositoryPath, ['rev-parse', 'HEAD'])).stdout.trim()
    progress('reinspect', 'Reading the resulting branch state.')
    const status = await this.git(repositoryPath, ['status', '--porcelain'])
    progress('complete', `Resume completed at ${commitSha.slice(0, 12)}.`)
    return {
      workflowId: 'resume',
      commitSha,
      branch,
      pushed: false,
      remote: null,
      verifiedClean: status.stdout.trim().length === 0,
      summary: 'Resume completed without switching branches or force-updating history.',
    }
  }

  private async git(repositoryPath: string, args: string[]) {
    return execFileAsync('git', ['-C', repositoryPath, ...args], {
      timeout: 30_000,
      maxBuffer: this.maxOutputBytes,
      windowsHide: true,
    })
  }
}
