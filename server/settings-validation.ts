import { AdviserError } from './errors'
import { resolveAllowedRepository, resolveAllowedRoot } from './security'

function settingsObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AdviserError(
      'settings-request-invalid',
      'Settings request must contain a JSON object.',
    )
  }
  return body as Record<string, unknown>
}

async function validateRepositoryRoots(candidate: unknown): Promise<string[]> {
  if (!Array.isArray(candidate)) {
    throw new AdviserError(
      'settings-request-invalid',
      'repositoryRoots must be an array of absolute directory paths.',
    )
  }
  if (candidate.length === 0) {
    throw new AdviserError(
      'settings-request-invalid',
      'At least one repository root is required.',
    )
  }
  if (candidate.length > 10) {
    throw new AdviserError(
      'settings-request-invalid',
      'A maximum of 10 repository roots is supported.',
    )
  }
  const roots = new Set<string>()
  for (const entry of candidate) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new AdviserError(
        'settings-request-invalid',
        'Each repository root must be a non-empty path.',
      )
    }
    try {
      roots.add(await resolveAllowedRoot(entry))
    } catch (error) {
      throw new AdviserError(
        'settings-request-invalid',
        error instanceof Error
          ? error.message
          : 'A repository root could not be resolved.',
        { cause: error },
      )
    }
  }
  return Array.from(roots)
}

function validateDirectoryNames(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) {
    throw new AdviserError(
      'settings-request-invalid',
      'excludeDirectories must be an array of directory names.',
    )
  }
  if (candidate.length > 20) {
    throw new AdviserError(
      'settings-request-invalid',
      'A maximum of 20 excluded directories is supported.',
    )
  }
  const names = new Set<string>()
  for (const entry of candidate) {
    if (
      typeof entry !== 'string'
      || entry.trim().length === 0
      || entry.includes('/')
      || entry.includes('\\')
      || entry === '.'
      || entry === '..'
    ) {
      throw new AdviserError(
        'settings-request-invalid',
        'Each excluded directory must be a simple directory name.',
      )
    }
    names.add(entry)
  }
  return Array.from(names)
}

function validateMaximumDepth(candidate: unknown): number | null {
  if (candidate === null) return null
  if (
    typeof candidate !== 'number'
    || !Number.isInteger(candidate)
    || candidate < 0
    || candidate > 10
  ) {
    throw new AdviserError(
      'settings-request-invalid',
      'maximumDepth must be an integer between 0 and 10.',
    )
  }
  return candidate
}

async function validateCanonicalRoot(
  candidate: unknown,
  effectiveRoots: string[],
): Promise<string | null> {
  if (candidate === null) return null
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new AdviserError(
      'settings-request-invalid',
      'The TCTBP-Web root must be a repository path or null.',
    )
  }
  for (const root of effectiveRoots) {
    try {
      return (await resolveAllowedRepository(root, candidate)).repositoryPath
    } catch {
      // Try the next configured root.
    }
  }
  throw new AdviserError(
    'settings-request-invalid',
    'The TCTBP-Web root must resolve to a repository inside a configured root.',
  )
}

function validateBooleanSetting(candidate: unknown): boolean | null {
  if (candidate === null) return null
  if (typeof candidate !== 'boolean') {
    throw new AdviserError(
      'settings-request-invalid',
      'githubEnabled must be a boolean or null.',
    )
  }
  return candidate
}

function validateGithubRepositories(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) {
    throw new AdviserError(
      'settings-request-invalid',
      'githubRepositories must be an array of GitHub repository names.',
    )
  }
  if (candidate.length > 100) {
    throw new AdviserError(
      'settings-request-invalid',
      'A maximum of 100 GitHub repositories is supported.',
    )
  }
  const names = new Set<string>()
  for (const entry of candidate) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new AdviserError(
        'settings-request-invalid',
        'Each GitHub repository must be a non-empty name.',
      )
    }
    names.add(entry)
  }
  return Array.from(names)
}

export { settingsObject }
export {
  validateBooleanSetting,
  validateCanonicalRoot,
  validateDirectoryNames,
  validateGithubRepositories,
  validateMaximumDepth,
  validateRepositoryRoots,
}
