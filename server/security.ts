import {
  lstat,
  readFile,
  realpath,
  stat,
} from 'node:fs/promises'
import path from 'node:path'
import { AdviserError } from './errors'

export const MAX_TCTBP_FILE_BYTES = 256 * 1024

export function isPathContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

export async function resolveAllowedRepository(
  allowedRoot: string,
  repositoryPath: string,
): Promise<{ allowedRoot: string; repositoryPath: string }> {
  if (!path.isAbsolute(allowedRoot) || !path.isAbsolute(repositoryPath)) {
    throw new AdviserError(
      'configuration-path-not-absolute',
      'Configured repository paths must be absolute.',
    )
  }

  const [resolvedRoot, resolvedRepository] = await Promise.all([
    realpath(allowedRoot),
    realpath(repositoryPath),
  ])

  if (!isPathContained(resolvedRoot, resolvedRepository)) {
    throw new AdviserError(
      'repository-outside-allowed-root',
      'Configured repository resolves outside the allowed root.',
    )
  }

  const repositoryStats = await stat(resolvedRepository)
  if (!repositoryStats.isDirectory()) {
    throw new AdviserError(
      'repository-not-directory',
      'Configured repository is not a directory.',
    )
  }

  return {
    allowedRoot: resolvedRoot,
    repositoryPath: resolvedRepository,
  }
}

export async function readBoundedRepositoryFile(
  repositoryRoot: string,
  relativePath: string,
  maxBytes = MAX_TCTBP_FILE_BYTES,
): Promise<string | null> {
  const candidate = path.resolve(repositoryRoot, relativePath)
  if (!isPathContained(repositoryRoot, candidate)) {
    throw new AdviserError(
      'repository-file-outside-root',
      'Repository file path escapes the configured repository.',
    )
  }

  let candidateStats
  try {
    candidateStats = await lstat(candidate)
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }
    throw error
  }

  if (candidateStats.isSymbolicLink()) {
    throw new AdviserError(
      'repository-file-symlink-rejected',
      'Repository metadata file cannot be a symbolic link.',
    )
  }
  if (!candidateStats.isFile()) {
    throw new AdviserError(
      'repository-file-not-regular',
      'Repository metadata path is not a regular file.',
    )
  }
  if (candidateStats.size > maxBytes) {
    throw new AdviserError(
      'repository-file-too-large',
      'Repository metadata file exceeds the inspection limit.',
    )
  }

  const resolvedCandidate = await realpath(candidate)
  if (!isPathContained(repositoryRoot, resolvedCandidate)) {
    throw new AdviserError(
      'repository-file-outside-root',
      'Repository metadata file resolves outside the repository.',
    )
  }

  return readFile(resolvedCandidate, 'utf8')
}

export async function repositoryEntryExists(
  repositoryRoot: string,
  relativePath: string,
): Promise<boolean> {
  return (await resolveRepositoryEntry(repositoryRoot, relativePath)) !== null
}

export async function resolveRepositoryEntry(
  repositoryRoot: string,
  relativePath: string,
): Promise<string | null> {
  const candidate = path.resolve(repositoryRoot, relativePath)
  if (!isPathContained(repositoryRoot, candidate)) {
    throw new AdviserError(
      'repository-file-outside-root',
      'Repository file path escapes the configured repository.',
    )
  }

  let candidateStats
  try {
    candidateStats = await lstat(candidate)
  } catch (error) {
    if (isMissingFileError(error)) return null
    throw error
  }
  if (candidateStats.isSymbolicLink()) {
    throw new AdviserError(
      'repository-file-symlink-rejected',
      'Managed repository entry cannot be a symbolic link.',
    )
  }

  const resolvedCandidate = await realpath(candidate)
  if (!isPathContained(repositoryRoot, resolvedCandidate)) {
    throw new AdviserError(
      'repository-file-outside-root',
      'Managed repository entry resolves outside the repository.',
    )
  }
  return resolvedCandidate
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
  )
}
