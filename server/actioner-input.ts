import type { IncomingMessage } from 'node:http'
import type {
  ActionerRequest,
  AddOriginRequest,
  CreateOriginRequest,
} from '../shared/actioner'
import { AdviserError } from './errors'

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 8 * 1024) {
      throw new AdviserError('request-body-too-large', 'Actioner request exceeds the input limit.')
    }
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    throw new AdviserError('request-json-invalid', 'Actioner request must contain valid JSON.', { cause: error })
  }
}

export async function readActionerRequest(
  request: IncomingMessage,
): Promise<ActionerRequest> {
  const body = await readJsonBody(request)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AdviserError('request-body-invalid', 'Actioner request must contain an object.')
  }
  const value = body as Record<string, unknown>
  if (
    !['checkpoint', 'publish', 'deploy-development', 'branch-development', 'repair-tctbp-script-compatibility', 'handover', 'resume', 'promote-review', 'promote-production', 'ship'].includes(String(value.workflowId))
    || !['preserve-locally', 'preserve-and-publish', 'deploy-current-environment', 'continue-on-another-machine', 'resume-after-machine-change', 'prepare-pre-production', 'prepare-production-release'].includes(String(value.intent))
    || value.confirm !== true
    || typeof value.planFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.planFingerprint)
  ) {
    throw new AdviserError(
      'actioner-request-invalid',
      'Action requires explicit confirmation, a supported workflow, and a valid plan fingerprint.',
    )
  }
  return {
    workflowId: value.workflowId as 'checkpoint' | 'publish' | 'deploy-development' | 'branch-development' | 'repair-tctbp-script-compatibility' | 'handover' | 'resume' | 'promote-review' | 'promote-production' | 'ship',
    intent: value.intent as 'preserve-locally' | 'preserve-and-publish' | 'deploy-current-environment' | 'continue-on-another-machine' | 'resume-after-machine-change' | 'prepare-pre-production' | 'prepare-production-release',
    planFingerprint: value.planFingerprint,
    confirm: true,
  }
}

/** Reads the add-origin request: explicit confirmation plus a user URL. */
export async function readAddOriginRequest(
  request: IncomingMessage,
): Promise<AddOriginRequest> {
  const body = await readJsonBody(request)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AdviserError('request-body-invalid', 'Add-origin request must contain an object.')
  }
  const value = body as Record<string, unknown>
  if (
    value.workflowId !== 'add-origin'
    || value.confirm !== true
    || typeof value.url !== 'string'
    || value.url.trim().length === 0
  ) {
    throw new AdviserError(
      'actioner-request-invalid',
      'Add origin requires explicit confirmation and an origin URL.',
    )
  }
  return {
    workflowId: 'add-origin',
    confirm: true,
    url: value.url,
  }
}

/** Reads the create-origin request: confirmation, name, and visibility. */
export async function readCreateOriginRequest(
  request: IncomingMessage,
): Promise<CreateOriginRequest> {
  const body = await readJsonBody(request)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AdviserError('request-body-invalid', 'Create-origin request must contain an object.')
  }
  const value = body as Record<string, unknown>
  if (
    value.workflowId !== 'create-origin'
    || value.confirm !== true
    || typeof value.name !== 'string'
    || value.name.trim().length === 0
    || (value.visibility !== 'private' && value.visibility !== 'public')
  ) {
    throw new AdviserError(
      'actioner-request-invalid',
      'Create origin requires explicit confirmation, a repository name, and a visibility.',
    )
  }
  return {
    workflowId: 'create-origin',
    confirm: true,
    name: value.name,
    visibility: value.visibility,
  }
}
