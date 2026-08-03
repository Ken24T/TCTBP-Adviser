import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ActionerResult } from '../shared/actioner'

const execFileAsync = promisify(execFile)

export class HandoverActioner {
  constructor(readonly timeoutMs = 180_000, readonly maxOutputBytes = 2 * 1024 * 1024) {}

  async run(repositoryPath: string, branch: string | null, progress: (step: 'validate' | 'execute' | 'reinspect' | 'complete', detail?: string) => void): Promise<ActionerResult> {
    if (!branch || branch === 'HEAD') throw new Error('Handover requires an attached branch.')
    progress('validate', 'Handover preflight passed.')
    progress('execute', 'Running the fixed TCTBP handover workflow.')
    await execFileAsync(process.execPath, [
      'scripts/tctbp-run-handover.js',
      '--note',
      'Actioner handover: preserve continuation context for the next session.',
    ], { cwd: repositoryPath, timeout: this.timeoutMs, maxBuffer: this.maxOutputBytes, windowsHide: true })
    const commitSha = (await execFileAsync('git', ['-C', repositoryPath, 'rev-parse', 'HEAD'])).stdout.trim()
    progress('reinspect', 'Reading the resulting handover state.')
    const continuationFile = await newestContinuationFile(repositoryPath)
    const continuationSummary = continuationFile
      ? ` Continuation file: ${continuationFile}.`
      : ' No continuation file was found.'
    progress('complete', `Handover completed at ${commitSha.slice(0, 12)}.${continuationSummary}`)
    return {
      workflowId: 'handover',
      commitSha,
      branch,
      pushed: true,
      remote: null,
      verifiedClean: true,
      summary: `Handover completed; continuation context and branch publication were handled by TCTBP.${continuationFile ? ` Continuation file: ${continuationFile}.` : ' No continuation file was found.'}`,
    }
  }
}

async function newestContinuationFile(repositoryPath: string): Promise<string | null> {
  try {
    const directory = path.join(repositoryPath, '.tctbp', 'continuation')
    const files = (await readdir(directory))
      .filter((file) => file.endsWith('.md'))
      .sort()
    return files.length > 0 ? `.tctbp/continuation/${files[files.length - 1]}` : null
  } catch {
    return null
  }
}
