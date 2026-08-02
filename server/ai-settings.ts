import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface AiSettings {
  enabled: boolean
  apiKey: string | null
  baseUrl: string | null
  model: string | null
  timeoutMs: number
  maximumResponseBytes: number
}

interface EncryptedSettings {
  ciphertext: string
  iv: string
  tag: string
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  apiKey: null,
  baseUrl: null,
  model: null,
  timeoutMs: 30_000,
  maximumResponseBytes: 512 * 1024,
}

export async function loadAiSettings(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<AiSettings> {
  const filePath = settingsFilePath(environment)
  let stored: Partial<AiSettings> = {}
  try {
    const encrypted = JSON.parse(await readFile(filePath, 'utf8')) as EncryptedSettings
    stored = JSON.parse(await decrypt(encrypted, environment)) as Partial<AiSettings>
  } catch {
    stored = {}
  }

  const enabled = environment.TCTBP_ADVISER_AI_ENABLED
    ? parseBoolean(environment.TCTBP_ADVISER_AI_ENABLED)
    : stored.enabled === true
  return {
    enabled,
    apiKey: typeof stored.apiKey === 'string' && stored.apiKey.length > 0
      ? stored.apiKey
      : null,
    baseUrl: normaliseUrl(
      environment.TCTBP_ADVISER_AI_BASE_URL ?? stored.baseUrl,
    ),
    model: normaliseString(
      environment.TCTBP_ADVISER_AI_MODEL ?? stored.model,
    ),
    timeoutMs: boundedInteger(
      environment.TCTBP_ADVISER_AI_TIMEOUT_MS,
      stored.timeoutMs ?? DEFAULT_AI_SETTINGS.timeoutMs,
      1_000,
      300_000,
    ),
    maximumResponseBytes: boundedInteger(
      environment.TCTBP_ADVISER_AI_MAX_RESPONSE_BYTES,
      stored.maximumResponseBytes ?? DEFAULT_AI_SETTINGS.maximumResponseBytes,
      16 * 1024,
      2 * 1024 * 1024,
    ),
  }
}

export async function saveAiSettings(
  settings: AiSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const filePath = settingsFilePath(environment)
  const encrypted = await encrypt(JSON.stringify({
    enabled: settings.enabled,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    timeoutMs: settings.timeoutMs,
    maximumResponseBytes: settings.maximumResponseBytes,
  }), environment)
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  await writeFile(filePath, `${JSON.stringify(encrypted, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  await chmod(filePath, 0o600)
}

export function safeAiSettings(settings: AiSettings) {
  return {
    enabled: settings.enabled,
    configured: settings.apiKey !== null
      && settings.baseUrl !== null
      && settings.model !== null,
    baseUrl: settings.baseUrl,
    model: settings.model,
    timeoutMs: settings.timeoutMs,
    maximumResponseBytes: settings.maximumResponseBytes,
  }
}

function settingsFilePath(environment: NodeJS.ProcessEnv): string {
  return path.resolve(
    environment.TCTBP_ADVISER_AI_SETTINGS_FILE
      ?? path.join(os.homedir(), '.config', 'tctbp-adviser', 'ai-settings.json'),
  )
}

function keyFilePath(environment: NodeJS.ProcessEnv): string {
  return path.resolve(
    environment.TCTBP_ADVISER_AI_KEY_FILE
      ?? path.join(os.homedir(), '.config', 'tctbp-adviser', 'ai-settings.key'),
  )
}

async function encryptionKey(environment: NodeJS.ProcessEnv): Promise<Buffer> {
  const filePath = keyFilePath(environment)
  try {
    const key = Buffer.from((await readFile(filePath, 'utf8')).trim(), 'base64')
    if (key.length !== 32) throw new Error('Invalid AI settings key.')
    return key
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid AI settings key.') throw error
    const key = randomBytes(32)
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    await writeFile(filePath, `${key.toString('base64')}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    await chmod(filePath, 0o600)
    return key
  }
}

async function encrypt(value: string, environment: NodeJS.ProcessEnv): Promise<EncryptedSettings> {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', await encryptionKey(environment), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

async function decrypt(
  value: EncryptedSettings,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    await encryptionKey(environment),
    Buffer.from(value.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value === undefined ? fallback : Number(value)
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback
}

function parseBoolean(value: string): boolean {
  return value.trim().toLowerCase() === 'true'
}

function normaliseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normaliseUrl(value: unknown): string | null {
  const text = normaliseString(value)
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString().replace(/\/$/, '')
      : null
  } catch {
    return null
  }
}
