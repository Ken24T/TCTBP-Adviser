import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ActionerResult } from '../shared/actioner'

const execFileAsync = promisify(execFile)

export interface RepairProgress {
  (step: 'validate' | 'execute' | 'reinspect' | 'complete', detail?: string): void
}

export class RepairActioner {
  constructor(readonly maxOutputBytes = 1_048_576) {}

  async run(
    repositoryPath: string,
    branch: string | null,
    progress: RepairProgress,
  ): Promise<ActionerResult> {
    if (!branch) throw new Error('Compatibility repair requires an attached branch.')
    const rootPackage = JSON.parse(await readFile(path.join(repositoryPath, 'package.json'), 'utf8')) as Record<string, unknown>
    const scriptsPath = path.join(repositoryPath, 'scripts')
    const compatibilityPath = path.join(scriptsPath, 'package.json')
    const compatibilityPackage = { type: 'commonjs' }
    progress('validate', 'Checking ESM root and missing TCTBP script compatibility boundary.')
    const status = await this.git(repositoryPath, ['status', '--porcelain'])
    if (status.stdout.trim()) throw new Error('Compatibility repair requires a clean working tree.')
    if (rootPackage.type !== 'module') throw new Error('Compatibility repair is only required for ESM targets.')
    try {
      const existing = JSON.parse(await readFile(compatibilityPath, 'utf8')) as Record<string, unknown>
      if (existing.type === 'commonjs') throw new Error('TCTBP script compatibility is already configured.')
    } catch (error) {
      if (error instanceof Error && error.message.includes('already configured')) throw error
    }
    progress('execute', 'Writing scripts/package.json with CommonJS script scope.')
    await writeFile(compatibilityPath, `${JSON.stringify(compatibilityPackage, null, 2)}\n`, 'utf8')
    progress('reinspect', 'Reading the repaired target state.')
    const repaired = JSON.parse(await readFile(compatibilityPath, 'utf8')) as Record<string, unknown>
    if (repaired.type !== 'commonjs') throw new Error('Compatibility repair could not be verified.')
    progress('complete', 'Compatibility boundary repaired; checkpoint before publishing or deploying.')
    return {
      workflowId: 'repair-tctbp-script-compatibility',
      commitSha: (await this.git(repositoryPath, ['rev-parse', 'HEAD'])).stdout.trim(),
      branch,
      pushed: false,
      remote: null,
      verifiedClean: false,
      summary: 'TCTBP script compatibility repaired; create a checkpoint before continuing.',
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
