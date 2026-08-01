import { AdviserError } from './errors'
import {
  resolveAllowedRepository,
  resolveAllowedRoot,
} from './security'

export interface ServiceConfig {
  repositoryRoots: string[]
  canonicalTctbpWebRoot?: string | null
  excludeDirectories: string[]
  maximumDepth: number
  maximumDirectories: number
  maximumRepositories: number
  portfolioCacheTtlMs: number
  inspectionConcurrency: number
  commandTimeoutMs: number
  commandMaxOutputBytes: number
  github: GitHubConfig
}

export interface GitHubConfig {
  enabled: boolean
  token: string | null
  repositories: string[]
  timeoutMs: number
  maxResponseBytes: number
  cacheTtlMs: number
  concurrency: number
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

  const canonicalTctbpWebRoot = environment.TCTBP_ADVISER_TCTBP_WEB_ROOT
    ? await resolveConfiguredRepository(
      repositoryRoots,
      environment.TCTBP_ADVISER_TCTBP_WEB_ROOT,
    )
    : null

  return {
    repositoryRoots,
    canonicalTctbpWebRoot,
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
    github: {
      enabled: booleanValue(
        environment.TCTBP_ADVISER_GITHUB_ENABLED,
        false,
        'TCTBP_ADVISER_GITHUB_ENABLED',
      ),
      token: optionalSecret(environment.TCTBP_ADVISER_GITHUB_TOKEN),
      repositories: environment.TCTBP_ADVISER_GITHUB_REPOSITORIES
        ? githubRepositoryNames(jsonArray(
          environment.TCTBP_ADVISER_GITHUB_REPOSITORIES,
          'TCTBP_ADVISER_GITHUB_REPOSITORIES',
          true,
        ))
        : [],
      timeoutMs: boundedInteger(
        environment.TCTBP_ADVISER_GITHUB_TIMEOUT_MS,
        5_000,
        500,
        30_000,
        'TCTBP_ADVISER_GITHUB_TIMEOUT_MS',
      ),
      maxResponseBytes: boundedInteger(
        environment.TCTBP_ADVISER_GITHUB_MAX_RESPONSE_BYTES,
        2 * 1024 * 1024,
        1024,
        10 * 1024 * 1024,
        'TCTBP_ADVISER_GITHUB_MAX_RESPONSE_BYTES',
      ),
      cacheTtlMs: boundedInteger(
        environment.TCTBP_ADVISER_GITHUB_CACHE_TTL_MS,
        60_000,
        1_000,
        600_000,
        'TCTBP_ADVISER_GITHUB_CACHE_TTL_MS',
      ),
      concurrency: boundedInteger(
        environment.TCTBP_ADVISER_GITHUB_CONCURRENCY,
        3,
        1,
        6,
        'TCTBP_ADVISER_GITHUB_CONCURRENCY',
      ),
    },
  }
}

async function ensureLegacyRepositoryIsAllowed(
  roots: string[],
  repositoryPath: string,
): Promise<void> {
  await resolveConfiguredRepository(roots, repositoryPath)
}

async function resolveConfiguredRepository(
  roots: string[],
  repositoryPath: string,
): Promise<string> {
  for (const root of roots) {
    try {
      return (await resolveAllowedRepository(root, repositoryPath)).repositoryPath
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
  return jsonArray(value, name, false)
}

function jsonArray(
  value: string,
  name: string,
  allowEmpty: boolean,
): string[] {
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
    || (!allowEmpty && parsed.length === 0)
    || parsed.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new AdviserError(
      'configuration-invalid',
      `${name} must be a non-empty JSON array of strings.`,
    )
  }
  return parsed.map((item) => (item as string).trim())
}

function githubRepositoryNames(values: string[]): string[] {
  const names = new Map<string, string>()
  for (const value of values) {
    const parts = value.split('/')
    if (
      parts.length !== 2
      || parts.some((part) => (
        !/^[A-Za-z0-9_.-]+$/.test(part)
        || part === '.'
        || part === '..'
      ))
    ) {
      throw new AdviserError(
        'configuration-invalid',
        'GitHub repositories must use the owner/name format.',
      )
    }
    names.set(value.toLocaleLowerCase(), value)
  }
  return [...names.values()]
}

function optionalSecret(value: string | undefined): string | null {
  const cleaned = value?.trim()
  return cleaned || null
}

function booleanValue(
  value: string | undefined,
  fallback: boolean,
  name: string,
): boolean {
  if (value === undefined || value.trim() === '') return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new AdviserError(
    'configuration-invalid',
    `${name} must be true or false.`,
  )
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
