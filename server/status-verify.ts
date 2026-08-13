import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type {
  StatusVerifyDocument,
  StatusVerifyErrorCode,
  StatusVerifyResult,
} from '../shared/status-verify'

const STATUS_RUNNER_RELATIVE = path.join('scripts', 'tctbp-run-status.js')
const DEFAULT_TIMEOUT_MS = 15_000

export interface RunStatusVerifyOptions {
  timeoutMs?: number
}

/**
 * Runs the repository's own canonical status runner read-only
 * (`--no-fetch --json`) and parses its contract-v1 inspection document.
 * Verification is always a subprocess call into the installed surface, so it
 * never mutates anything — the runner is explicitly invoked with --no-fetch.
 */
export function runStatusVerify(
  repositoryPath: string,
  options: RunStatusVerifyOptions = {},
): Promise<StatusVerifyResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const runner = path.join(repositoryPath, STATUS_RUNNER_RELATIVE)

  if (!existsSync(runner)) {
    return Promise.resolve(noSurfaceResult())
  }

  return new Promise((resolve) => {
    const child = spawn('node', [runner, '--no-fetch', '--json'], {
      cwd: repositoryPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolve({
        ok: false,
        exitCode: null,
        errorCode: 'timeout',
        message: `The status runner did not complete within ${Math.round(timeoutMs / 1000)} s.`,
        document: null,
      })
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        ok: false,
        exitCode: null,
        errorCode: 'internal',
        message: error.message,
        document: null,
      })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        resolve({
          ok: false,
          exitCode: code,
          errorCode: 'runner-failed',
          message: stderr.trim()
            || `The status runner exited with code ${code}.`,
          document: null,
        })
        return
      }
      const document = parseStatusDocument(stdout)
      if (!document) {
        resolve({
          ok: false,
          exitCode: code,
          errorCode: 'invalid-output',
          message: 'The status runner produced no readable inspection document.',
          document: null,
        })
        return
      }
      resolve({ ok: true, exitCode: code, errorCode: null, message: null, document })
    })
  })
}

function noSurfaceResult(): StatusVerifyResult {
  return {
    ok: false,
    exitCode: null,
    errorCode: 'no-tctbp-surface',
    message: 'No TCTBP status runner is installed in this repository.',
    document: null,
  }
}

function parseStatusDocument(stdout: string): StatusVerifyDocument | null {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const root = raw as Record<string, unknown>
  const observation = root.observation
  if (typeof observation !== 'object' || observation === null) return null
  const o = observation as Record<string, unknown>

  const repository = asRecord(o.repository)
  const head = asRecord(o.head)
  const workingTree = asRecord(o.workingTree)
  const release = asRecord(o.release)
  const statusAdvice = asRecord(o.statusAdvice)

  return {
    contract: parseContract(root.contract),
    observation: {
      provider: stringField(o.provider, 'tctbp-web'),
      observedAt: stringField(o.observedAt, ''),
      fetchPerformed: o.fetchPerformed === true,
      repository: {
        name: stringField(repository?.name, 'unknown'),
        tctbpSchemaVersion: numberOrNull(repository?.tctbpSchemaVersion),
        tctbpVersion: stringOrNull(repository?.tctbpVersion),
        versionSource: stringOrNull(repository?.versionSource),
      },
      head: {
        branch: stringOrNull(head?.branch),
        detached: head?.detached === true,
        sha: stringOrNull(head?.sha),
      },
      workingTree: {
        clean: workingTree?.clean === true,
        pathCount: numberField(workingTree?.pathCount, 0),
      },
      operations: stringArray(o.operations),
      release: {
        reachableTag: stringOrNull(release?.reachableTag),
        publishedTag: stringOrNull(release?.publishedTag),
      },
      continuationFileCount: numberOrNull(o.continuationFileCount),
      statusAdvice: {
        tokens: stringArray(statusAdvice?.tokens),
        reasonCodes: stringArray(statusAdvice?.reasonCodes),
      },
      activeGuardrails: stringArray(o.activeGuardrails),
    },
    errors: Array.isArray(root.errors) ? root.errors : [],
  }
}

function parseContract(value: unknown): StatusVerifyDocument['contract'] {
  const contract = asRecord(value)
  if (!contract) return null
  return {
    name: stringField(contract.name, 'TCTBP Adviser'),
    major: numberField(contract.major, 0),
    minor: numberField(contract.minor, 0),
    capabilities: stringArray(contract.capabilities),
    schema: stringField(contract.schema, ''),
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberField(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}
