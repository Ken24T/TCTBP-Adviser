import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { GitOperation } from '../shared/inspection'
import { AdviserError } from './errors'
import { isPathContained } from './security'
import {
  GIT_COMMANDS,
  type GitExecutor,
} from './git-command'
import { parsePorcelainV2, type ParsedGitStatus } from './git-status'

export interface LocalGitObservation extends ParsedGitStatus {
  operations: GitOperation[]
}

export class LocalGitInspector {
  constructor(readonly executor: GitExecutor) {}

  async inspect(repositoryPath: string): Promise<LocalGitObservation> {
    const [topLevelResult, gitDirResult, statusResult] = await Promise.all([
      this.executor.run(repositoryPath, GIT_COMMANDS.topLevel),
      this.executor.run(repositoryPath, GIT_COMMANDS.gitDir),
      this.executor.run(repositoryPath, GIT_COMMANDS.status),
    ])

    const topLevel = await realpath(topLevelResult.stdout.trim())
    if (topLevel !== repositoryPath) {
      throw new AdviserError(
        'configured-path-not-repository-root',
        'Configured path must be the repository root.',
      )
    }

    const rawGitDir = gitDirResult.stdout.trim()
    const unresolvedGitDir = path.isAbsolute(rawGitDir)
      ? rawGitDir
      : path.resolve(repositoryPath, rawGitDir)
    const gitDir = await realpath(unresolvedGitDir)
    if (!isPathContained(repositoryPath, gitDir)) {
      throw new AdviserError(
        'git-dir-outside-repository',
        'Repository Git directory resolves outside the configured root.',
      )
    }

    return {
      ...parsePorcelainV2(statusResult.stdout),
      operations: await detectOperations(gitDir),
    }
  }
}

const OPERATION_MARKERS: ReadonlyArray<{
  operation: GitOperation
  paths: readonly string[]
}> = [
  { operation: 'merge', paths: ['MERGE_HEAD'] },
  { operation: 'rebase', paths: ['rebase-merge', 'rebase-apply', 'REBASE_HEAD'] },
  { operation: 'cherry-pick', paths: ['CHERRY_PICK_HEAD'] },
  { operation: 'revert', paths: ['REVERT_HEAD'] },
  { operation: 'bisect', paths: ['BISECT_LOG', 'BISECT_START'] },
]

async function detectOperations(gitDir: string): Promise<GitOperation[]> {
  const operations: GitOperation[] = []
  for (const marker of OPERATION_MARKERS) {
    if (await anyPathExists(gitDir, marker.paths)) {
      operations.push(marker.operation)
    }
  }
  return operations
}

async function anyPathExists(
  root: string,
  relativePaths: readonly string[],
): Promise<boolean> {
  for (const relativePath of relativePaths) {
    try {
      await lstat(path.join(root, relativePath))
      return true
    } catch (error) {
      if (!isMissingFileError(error)) throw error
    }
  }
  return false
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
  )
}
