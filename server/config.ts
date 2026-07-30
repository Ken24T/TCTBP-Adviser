import path from 'node:path'
import { AdviserError } from './errors'
import { resolveAllowedRepository } from './security'

export interface ServiceConfig {
  allowedRoot: string
  repositoryPath: string
  repositoryName: string
  commandTimeoutMs: number
  commandMaxOutputBytes: number
}

export async function loadServiceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ServiceConfig> {
  const allowedRoot = requiredValue(
    environment.TCTBP_ADVISER_ALLOWED_ROOT,
    'TCTBP_ADVISER_ALLOWED_ROOT',
  )
  const repositoryPath = requiredValue(
    environment.TCTBP_ADVISER_REPOSITORY,
    'TCTBP_ADVISER_REPOSITORY',
  )
  const resolved = await resolveAllowedRepository(allowedRoot, repositoryPath)

  return {
    ...resolved,
    repositoryName: path.basename(resolved.repositoryPath),
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
