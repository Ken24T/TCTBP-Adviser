import {
  lstat,
  readdir,
  realpath,
} from 'node:fs/promises'
import path from 'node:path'
import type { ServiceConfig } from './config'

export interface DiscoveredRepository {
  name: string
  path: string
}

export interface DiscoveryIssue {
  code: string
  message: string
}

export interface DiscoverySnapshot {
  scannedAt: string
  repositories: DiscoveredRepository[]
  issues: DiscoveryIssue[]
}

export class RepositoryDiscovery {
  constructor(readonly config: ServiceConfig) {}

  async scan(): Promise<DiscoverySnapshot> {
    const repositories = new Map<string, DiscoveredRepository>()
    const issues: DiscoveryIssue[] = []
    const scan = { visitedDirectories: 0 }
    for (const root of this.config.repositoryRoots) {
      if (repositories.size >= this.config.maximumRepositories) break
      await this.walk(root, root, 0, repositories, issues, scan)
    }
    return {
      scannedAt: new Date().toISOString(),
      repositories: Array.from(repositories.values()).sort(
        (left, right) => left.name.localeCompare(right.name),
      ),
      issues,
    }
  }

  private async walk(
    root: string,
    directory: string,
    depth: number,
    repositories: Map<string, DiscoveredRepository>,
    issues: DiscoveryIssue[],
    scan: { visitedDirectories: number },
  ): Promise<void> {
    if (scan.visitedDirectories >= this.config.maximumDirectories) {
      addDirectoryLimitIssue(issues)
      return
    }
    scan.visitedDirectories += 1
    if (repositories.size >= this.config.maximumRepositories) {
      addLimitIssue(issues)
      return
    }
    if (await isRepository(directory)) {
      const canonicalPath = await realpath(directory)
      repositories.set(canonicalPath, {
        name: path.basename(canonicalPath),
        path: canonicalPath,
      })
      return
    }
    if (depth >= this.config.maximumDepth) return

    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      issues.push({
        code: 'directory-unavailable',
        message: 'A directory within a configured root could not be read.',
      })
      return
    }

    for (const entry of entries) {
      if (repositories.size >= this.config.maximumRepositories) {
        addLimitIssue(issues)
        return
      }
      if (
        !entry.isDirectory()
        || entry.isSymbolicLink()
        || this.config.excludeDirectories.includes(entry.name)
      ) continue
      const candidate = path.join(directory, entry.name)
      const canonical = await safeContainedRealpath(root, candidate)
      if (!canonical) {
        issues.push({
          code: 'directory-outside-root',
          message: 'A directory resolving outside its configured root was skipped.',
        })
        continue
      }
      await this.walk(
        root,
        canonical,
        depth + 1,
        repositories,
        issues,
        scan,
      )
    }
  }
}

async function isRepository(directory: string): Promise<boolean> {
  try {
    const metadata = await lstat(path.join(directory, '.git'))
    return metadata.isDirectory() || metadata.isFile()
  } catch {
    return false
  }
}

async function safeContainedRealpath(
  root: string,
  candidate: string,
): Promise<string | null> {
  try {
    const resolved = await realpath(candidate)
    const relative = path.relative(root, resolved)
    return (
      relative === ''
      || (
        relative !== '..'
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative)
      )
    ) ? resolved : null
  } catch {
    return null
  }
}

function addLimitIssue(issues: DiscoveryIssue[]): void {
  if (issues.some((issue) => issue.code === 'repository-limit-reached')) return
  issues.push({
    code: 'repository-limit-reached',
    message: 'Repository discovery stopped at the configured safety limit.',
  })
}

function addDirectoryLimitIssue(issues: DiscoveryIssue[]): void {
  if (issues.some((issue) => issue.code === 'directory-limit-reached')) return
  issues.push({
    code: 'directory-limit-reached',
    message: 'Repository discovery stopped at the directory safety limit.',
  })
}
