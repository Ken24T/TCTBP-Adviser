/**
 * Result of running the repository's own canonical TCTBP status runner
 * (`node scripts/tctbp-run-status.js --no-fetch --json`) as an on-demand
 * verification of the installed surface.
 */

export interface StatusVerifyDocument {
  contract: {
    name: string
    major: number
    minor: number
    capabilities: string[]
    schema: string
  } | null
  observation: {
    provider: string
    observedAt: string
    fetchPerformed: boolean
    repository: {
      name: string
      tctbpSchemaVersion: number | null
      tctbpVersion: string | null
      versionSource: string | null
    }
    head: { branch: string | null; detached: boolean; sha: string | null }
    workingTree: { clean: boolean; pathCount: number }
    operations: string[]
    release: { reachableTag: string | null; publishedTag: string | null }
    continuationFileCount: number | null
    statusAdvice: { tokens: string[]; reasonCodes: string[] }
    activeGuardrails: string[]
  }
  errors: unknown[]
}

export type StatusVerifyErrorCode =
  | 'no-tctbp-surface'
  | 'runner-failed'
  | 'timeout'
  | 'invalid-output'
  | 'internal'

export interface StatusVerifyResult {
  ok: boolean
  exitCode: number | null
  errorCode: StatusVerifyErrorCode | null
  message: string | null
  document: StatusVerifyDocument | null
}
