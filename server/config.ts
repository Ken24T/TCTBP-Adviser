import { AdviserError } from './errors'
import {
  resolveAllowedRepository,
  resolveAllowedRoot,
} from './security'

export interface ServiceConfig {
  repositoryRoots: string[]
  excludeDirectories: string[]
  maximumDepth: number
  maximumDirectories: number
  maximumRepositories: number
  portfolioCacheTtlMs: number
  inspectionConcurrency: number
  commandTimeoutMs: number
  commandMaxOutputBytes: number
}

const DEFAULT_EXCLUDES = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'archive',
  '.cache',
]

export async function loadServiceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ServiceConfig> {
  const configuredRoots = environment.TCTBP_ADVISER_REPOSITORY_ROOTS
    ? jsonStringArray(
      environment.TCTBP_ADVISER_REPOSITORY_ROOTS,
      'TCTBP_ADVISER_REPOSITORY_ROOTS',
    )
    : [requiredValue(
      environment.TCTBP_ADVISER_ALLOWED_ROOT,
      'TCTBP_ADVISER_ALLOWED_ROOT',
    )]
  const repositoryRoots = Array.from(new Set(
    await Promise.all(configuredRoots.map(resolveAllowedRoot)),
  ))

  if (environment.TCTBP_ADVISER_REPOSITORY) {
    await ensureLegacyRepositoryIsAllowed(
      repositoryRoots,
      environment.TCTBP_ADVISER_REPOSITORY,
    )
  }

  return {
    repositoryRoots,
    excludeDirectories: environment.TCTBP_ADVISER_EXCLUDE_DIRECTORIES
      ? safeDirectoryNames(jsonStringArray(
        environment.TCTBP_ADVISER_EXCLUDE_DIRECTORIES,
        'TCTBP_ADVISER_EXCLUDE_DIRECTORIES',
      ))
      : DEFAULT_EXCLUDES,
    maximumDepth: boundedInteger(
      environment.TCTBP_ADVISER_MAXIMUM_DEPTH,
      3,
      0,
      10,
      'TCTBP_ADVISER_MAXIMUM_DEPTH',
    ),
    maximumRepositories: boundedInteger(
      environment.TCTBP_ADVISER_MAXIMUM_REPOSITORIES,
      200,
      1,
      1_000,
      'TCTBP_ADVISER_MAXIMUM_REPOSITORIES',
    ),
    maximumDirectories: boundedInteger(
      environment.TCTBP_ADVISER_MAXIMUM_DIRECTORIES,
      5_000,
      1,
      50_000,
      'TCTBP_ADVISER_MAXIMUM_DIRECTORIES',
    ),
    portfolioCacheTtlMs: boundedInteger(
      environment.TCTBP_ADVISER_CACHE_TTL_MS,
      30_000,
      1_000,
      300_000,
      'TCTBP_ADVISER_CACHE_TTL_MS',
    ),
    inspectionConcurrency: boundedInteger(
      environment.TCTBP_ADVISER_INSPECTION_CONCURRENCY,
      4,
      1,
      8,
      'TCTBP_ADVISER_INSPECTION_CONCURRENCY',
    ),
    commandTimeoutMs: positiveInteger(
      environment.TCTBP_ADVISER_GIT_TIMEOUT_MS,
      3_000,
      'TCTBP_ADVISER_GIT_TIMEOUT_MS',
    ),
    commandMaxOutputBytes: positiveInteger(
      environment.TCTBP_ADVISER_GIT_MAX_OUTPUT_BYTES,
      1024 * 1024,
      'TCTBP_ADVISER_GIT_MAX_OUTPUT_BYTES',
    ),
  }
}

async function ensureLegacyRepositoryIsAllowed(
  roots: string[],
  repositoryPath: string,
): Promise<void> {
  for (const root of roots) {
    try {
      await resolveAllowedRepository(root, repositoryPath)
      return
    } catch (error) {
      if (
        error instanceof AdviserError
        && error.code === 'repository-outside-allowed-root'
      ) continue
      throw error
    }
  }
  throw new AdviserError(
    'repository-outside-allowed-root',
    'Configured repository resolves outside the allowed roots.',
  )
}

function jsonStringArray(value: string, name: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new AdviserError(
      'configuration-invalid',
      `${name} must be a JSON array of strings.`,
    )
  }
  if (
    !Array.isArray(parsed)
    || parsed.length === 0
    || parsed.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new AdviserError(
      'configuration-invalid',
      `${name} must be a non-empty JSON array of strings.`,
    )
  }
  return parsed.map((item) => (item as string).trim())
}

function safeDirectoryNames(values: string[]): string[] {
  const unsafe = values.some((value) => (
    value === '.'
    || value === '..'
    || value.includes('/')
    || value.includes('\\')
  ))
  if (unsafe) {
    throw new AdviserError(
      'configuration-invalid',
      'Excluded directories must be names, not paths.',
    )
  }
  return Array.from(new Set(['.git', ...values]))
}

function requiredValue(value: string | undefined, name: string): string {
  const cleaned = value?.trim()
  if (!cleaned) {
    throw new AdviserError(
      'configuration-missing',
      `Missing required server configuration: ${name}.`,
    )
  }
  return cleaned
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === '') {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AdviserError(
      'configuration-invalid',
      `${name} must be a positive integer.`,
    )
  }
  return parsed
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (
    !Number.isSafeInteger(parsed)
    || parsed < minimum
    || parsed > maximum
  ) {
    throw new AdviserError(
      'configuration-invalid',
      `${name} must be an integer from ${minimum} to ${maximum}.`,
    )
  }
  return parsed
}
