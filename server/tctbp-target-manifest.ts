import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { AdviserError } from './errors'
import {
  isPathContained,
  resolveRepositoryEntry,
} from './security'

export async function listManagedSurfaceFiles(
  repositoryRoot: string,
  patterns: readonly string[],
): Promise<string[]> {
  const files = new Set<string>()
  for (const pattern of patterns) {
    validatePattern(pattern)
    if (!pattern.includes('*')) {
      const entry = await resolveRepositoryEntry(repositoryRoot, pattern)
      if (entry && (await stat(entry)).isFile()) files.add(pattern)
      continue
    }

    const directory = path.posix.dirname(pattern)
    const basename = path.posix.basename(pattern)
    if (directory.includes('*')) {
      throw new AdviserError(
        'managed-pattern-unsupported',
        'Managed surface wildcards are allowed only in file names.',
      )
    }
    const resolvedDirectory = await resolveRepositoryEntry(
      repositoryRoot,
      directory,
    )
    if (!resolvedDirectory || !(await stat(resolvedDirectory)).isDirectory()) {
      continue
    }
    const matcher = new RegExp(
      `^${basename.split('*').map(escapeRegex).join('.*')}$`,
    )
    for (const entry of await readdir(resolvedDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !matcher.test(entry.name)) continue
      files.add(path.posix.join(directory, entry.name))
    }
  }
  return Array.from(files).sort()
}

function validatePattern(pattern: string): void {
  if (
    !pattern
    || path.isAbsolute(pattern)
    || pattern.split(/[\\/]/).includes('..')
    || pattern.includes('\0')
  ) {
    throw new AdviserError(
      'managed-pattern-invalid',
      'Managed surface contains an unsafe path pattern.',
    )
  }
  const candidate = path.resolve('/', pattern)
  if (!isPathContained('/', candidate)) {
    throw new AdviserError(
      'managed-pattern-invalid',
      'Managed surface contains an unsafe path pattern.',
    )
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
