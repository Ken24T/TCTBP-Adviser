import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type {
  InspectionIssue,
  ScaffoldHealthObservation,
  TctbpObservation,
} from '../shared/inspection'
import { AdviserError, errorCode } from './errors'
import {
  isPathContained,
  readBoundedRepositoryFile,
  repositoryEntryExists,
  resolveRepositoryEntry,
} from './security'

const SUPPORTED_CONTRACT_MAJOR = 1
const REQUIRED_CAPABILITY = 'inspection.local-v1'

type JsonObject = Record<string, unknown>

export async function inspectTctbp(
  repositoryRoot: string,
): Promise<TctbpObservation> {
  const errors: InspectionIssue[] = []
  let profile: JsonObject | null = null

  try {
    profile = await readJsonObject(
      repositoryRoot,
      '.github/TCTBP.json',
    )
  } catch (error) {
    errors.push(issue(error, 'tctbp-profile-invalid'))
  }

  if (!profile) {
    return {
      installed: false,
      compatible: false,
      schemaVersion: null,
      projectName: null,
      contract: { major: null, minor: null, capabilities: [] },
      scaffold: unknownScaffold(),
      errors,
    }
  }

  const contract = objectValue(profile.adviserContract)
  const capabilities = stringArray(contract?.capabilities)
  const contractObservation = {
    major: integerValue(contract?.major),
    minor: integerValue(contract?.minor),
    capabilities,
  }
  const compatible = (
    contractObservation.major === SUPPORTED_CONTRACT_MAJOR
    && capabilities.includes(REQUIRED_CAPABILITY)
  )

  if (!compatible) {
    errors.push({
      code: 'tctbp-contract-incompatible',
      message: 'TCTBP Adviser contract is missing or unsupported.',
    })
  }

  return {
    installed: true,
    compatible,
    schemaVersion: integerValue(profile.schemaVersion),
    projectName: stringValue(objectValue(profile.project)?.name),
    contract: contractObservation,
    scaffold: await inspectScaffold(repositoryRoot, errors),
    errors,
  }
}

async function inspectScaffold(
  repositoryRoot: string,
  errors: InspectionIssue[],
): Promise<ScaffoldHealthObservation> {
  let source: JsonObject | null = null
  try {
    source = await readJsonObject(repositoryRoot, '.tctbp/source.json')
  } catch (error) {
    errors.push(issue(error, 'tctbp-source-invalid'))
  }

  if (!source) {
    return unknownScaffold()
  }

  const managedSurface = stringArray(source.managedSurface)
  const missingManagedPatterns: string[] = []
  for (const pattern of managedSurface) {
    try {
      if (!await managedPatternExists(repositoryRoot, pattern)) {
        missingManagedPatterns.push(pattern)
      }
    } catch (error) {
      errors.push(issue(error, 'tctbp-managed-surface-invalid'))
      missingManagedPatterns.push(pattern)
    }
  }

  return {
    status: missingManagedPatterns.length === 0 ? 'complete' : 'incomplete',
    sourceRepository: stringValue(source.sourceRepository),
    sourceRevision: stringValue(source.sourceRevision),
    sourceVersion: stringValue(source.sourceVersion),
    managedSurface,
    missingManagedPatterns,
    uncertainties: [
      'Managed-file content comparison is unavailable because the source manifest contains no file hashes.',
    ],
  }
}

async function managedPatternExists(
  repositoryRoot: string,
  pattern: string,
): Promise<boolean> {
  validateManagedPattern(pattern)
  if (!pattern.includes('*')) {
    return repositoryEntryExists(repositoryRoot, pattern)
  }

  const directory = path.dirname(pattern)
  const basenamePattern = path.basename(pattern)
  if (directory.includes('*')) {
    throw new AdviserError(
      'managed-pattern-unsupported',
      'Managed pattern wildcards are allowed only in the file name.',
    )
  }
  const candidateDirectory = path.resolve(repositoryRoot, directory)
  if (!isPathContained(repositoryRoot, candidateDirectory)) {
    throw new AdviserError(
      'managed-pattern-outside-root',
      'Managed pattern escapes the repository.',
    )
  }

  let names: string[]
  try {
    const resolvedDirectory = await resolveRepositoryEntry(
      repositoryRoot,
      directory,
    )
    if (!resolvedDirectory) return false
    names = await readdir(resolvedDirectory)
  } catch (error) {
    if (isMissingFileError(error)) return false
    throw error
  }
  const matcher = new RegExp(
    `^${escapeRegex(basenamePattern).replaceAll('*', '.*')}$`,
  )
  return names.some((name) => matcher.test(name))
}

function validateManagedPattern(pattern: string): void {
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
}

async function readJsonObject(
  repositoryRoot: string,
  relativePath: string,
): Promise<JsonObject | null> {
  const content = await readBoundedRepositoryFile(
    repositoryRoot,
    relativePath,
  )
  if (content === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    throw new AdviserError(
      'repository-json-invalid',
      'Repository metadata is not valid JSON.',
      { cause: error },
    )
  }
  const object = objectValue(parsed)
  if (!object) {
    throw new AdviserError(
      'repository-json-not-object',
      'Repository metadata must contain a JSON object.',
    )
  }
  return object
}

function objectValue(value: unknown): JsonObject | null {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  ) ? value as JsonObject : null
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  )))
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function integerValue(value: unknown): number | null {
  return Number.isInteger(value) ? value as number : null
}

function issue(error: unknown, fallbackCode: string): InspectionIssue {
  return {
    code: errorCode(error) === 'inspection-failed'
      ? fallbackCode
      : errorCode(error),
    message: error instanceof Error
      ? error.message
      : 'Repository metadata inspection failed.',
  }
}

function unknownScaffold(): ScaffoldHealthObservation {
  return {
    status: 'unknown',
    sourceRepository: null,
    sourceRevision: null,
    sourceVersion: null,
    managedSurface: [],
    missingManagedPatterns: [],
    uncertainties: [
      'No scaffold source manifest is available for managed-file comparison.',
    ],
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.-]/g, '\\$&')
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
  )
}
