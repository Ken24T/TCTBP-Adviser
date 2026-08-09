import { randomUUID } from 'node:crypto'
import { lstat, mkdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AdviserError } from './errors'
import {
  isPathContained,
  readBoundedRepositoryFile,
} from './security'

/**
 * Managed-file I/O for the canonical TCTBP source: atomic writes, bounded
 * deletes, and bounded reads that can never escape the target repository.
 */

export async function writeManagedFile(
  repositoryRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const candidate = path.resolve(repositoryRoot, relativePath)
  if (!isPathContained(repositoryRoot, candidate)) {
    throw new AdviserError(
      'upgrade-path-outside-root',
      'A managed upgrade path escapes the target repository.',
    )
  }
  const parent = path.dirname(candidate)
  await mkdir(parent, { recursive: true })
  const resolvedParent = await realpath(parent)
  if (!isPathContained(repositoryRoot, resolvedParent)) {
    throw new AdviserError(
      'upgrade-parent-outside-root',
      'A managed upgrade directory resolves outside the target repository.',
    )
  }
  try {
    const stats = await lstat(candidate)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new AdviserError(
        'upgrade-target-entry-invalid',
        'A managed target entry is not a regular file.',
      )
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error
  }

  const temporary = path.join(
    parent,
    `.${path.basename(candidate)}.tctbp-${randomUUID()}.tmp`,
  )
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, candidate)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

export async function deleteManagedFile(
  repositoryRoot: string,
  relativePath: string,
): Promise<void> {
  const candidate = path.resolve(repositoryRoot, relativePath)
  if (!isPathContained(repositoryRoot, candidate)) {
    throw new AdviserError(
      'upgrade-path-outside-root',
      'An obsolete managed path escapes the target repository.',
    )
  }
  const stats = await lstat(candidate)
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new AdviserError(
      'upgrade-target-entry-invalid',
      'An obsolete managed entry is not a regular file.',
    )
  }
  await unlink(candidate)
}

export async function readFiles(
  repositoryRoot: string,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const entries = await Promise.all(paths.map(async (relativePath) => (
    [relativePath, await readBoundedRepositoryFile(repositoryRoot, relativePath)] as const
  )))
  return new Map(entries.filter(
    (entry): entry is readonly [string, string] => entry[1] !== null,
  ))
}

export function parseVersion(content: string | null): string | null {
  if (!content) return null
  try {
    const value: unknown = JSON.parse(content)
    if (
      typeof value === 'object'
      && value !== null
      && 'version' in value
      && typeof value.version === 'string'
    ) return value.version
  } catch {
    return content.trim() || null
  }
  return null
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
  )
}
