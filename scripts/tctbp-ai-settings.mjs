#!/usr/bin/env node

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const command = process.argv[2] || 'status'
const options = parseOptions(process.argv.slice(3))

if (!['configure', 'status', 'test'].includes(command)) {
  printUsage(1)
}

const settingsPath = path.resolve(
  options.settingsFile
    || process.env.TCTBP_ADVISER_AI_SETTINGS_FILE
    || path.join(os.homedir(), '.config', 'tctbp-adviser', 'ai-settings.json'),
)
const keyPath = path.resolve(
  options.keyFile
    || process.env.TCTBP_ADVISER_AI_KEY_FILE
    || path.join(os.homedir(), '.config', 'tctbp-adviser', 'ai-settings.key'),
)

if (command === 'status') {
  const settings = await loadSettings()
  printStatus(settings)
  process.exit(0)
}

if (command === 'test') {
  const settings = await loadSettings()
  printStatus(settings)
  process.exit(await testConnectivity(settings) ? 0 : 1)
}

const current = await loadSettings()
const baseUrl = options.baseUrl || await ask('Base URL', current.baseUrl || '')
const model = options.model || await ask('Model', current.model || '')
const enabled = options.disabled
  ? false
  : options.enabled || await ask('Enable AI review? (y/N)', current.enabled ? 'y' : 'n')
    .then((value) => value.trim().toLowerCase() === 'y')
const apiKey = options.keyStdin
  ? await readStdinSecret()
  : await askSecret('API key (leave blank to keep the existing key)')

await saveSettings({
  enabled,
  apiKey: apiKey || current.apiKey || null,
  baseUrl: normaliseUrl(baseUrl),
  model: model.trim() || null,
  timeoutMs: current.timeoutMs,
  maximumResponseBytes: current.maximumResponseBytes,
})
console.log(`Encrypted AI settings saved to ${settingsPath}`)
console.log(`Enabled: ${enabled ? 'yes' : 'no'}`)
console.log(`Configured: ${apiKey || current.apiKey ? 'yes' : 'no'}`)

function printStatus(settings) {
  console.log(`Settings file: ${settingsPath}`)
  console.log(`Enabled: ${settings.enabled ? 'yes' : 'no'}`)
  console.log(`Configured: ${settings.apiKey && settings.baseUrl && settings.model ? 'yes' : 'no'}`)
  console.log(`Base URL: ${settings.baseUrl || 'not configured'}`)
  console.log(`Model: ${settings.model || 'not configured'}`)
}

async function testConnectivity(settings) {
  if (!settings.apiKey || !settings.baseUrl) {
    console.log('Connectivity: not configured')
    return false
  }
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), settings.timeoutMs)
  try {
    const response = await fetch(`${settings.baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    console.log(`Connectivity: ${response.ok ? 'ok' : `HTTP ${response.status}`}`)
    return response.ok
  } catch (error) {
    console.log(
      `Connectivity: ${error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'unreachable'}`,
    )
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseOptions(args) {
  const parsed = {
    settingsFile: null,
    keyFile: null,
    baseUrl: null,
    model: null,
    enabled: false,
    disabled: false,
    keyStdin: false,
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--settings-file') parsed.settingsFile = args[++index]
    else if (arg === '--key-file') parsed.keyFile = args[++index]
    else if (arg === '--base-url') parsed.baseUrl = args[++index]
    else if (arg === '--model') parsed.model = args[++index]
    else if (arg === '--enabled') parsed.enabled = true
    else if (arg === '--disabled') parsed.disabled = true
    else if (arg === '--key-stdin') parsed.keyStdin = true
    else printUsage(1)
  }
  return parsed
}

function printUsage(code) {
  console.log('Usage: npm run ai:settings -- <configure|status|test> [options]')
  console.log('  --settings-file <path>  Override encrypted settings path')
  console.log('  --key-file <path>       Override encryption key path')
  console.log('  --base-url <url>        Set provider base URL')
  console.log('  --model <name>          Set provider model')
  console.log('  --enabled|--disabled    Set enabled state without prompting')
  console.log('  --key-stdin             Read the API key from stdin without echoing it')
  process.exit(code)
}

async function loadSettings() {
  const defaults = {
    enabled: false,
    apiKey: null,
    baseUrl: null,
    model: null,
    timeoutMs: 30_000,
    maximumResponseBytes: 512 * 1024,
  }
  try {
    const encrypted = JSON.parse(await readFile(settingsPath, 'utf8'))
    return { ...defaults, ...JSON.parse(await decrypt(encrypted)) }
  } catch {
    return defaults
  }
}

async function saveSettings(settings) {
  const encrypted = await encrypt(JSON.stringify(settings))
  await mkdir(path.dirname(settingsPath), { recursive: true, mode: 0o700 })
  await writeFile(settingsPath, `${JSON.stringify(encrypted, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  await chmod(settingsPath, 0o600)
}

async function encryptionKey() {
  try {
    const key = Buffer.from((await readFile(keyPath, 'utf8')).trim(), 'base64')
    if (key.length !== 32) throw new Error('Invalid encryption key')
    return key
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid encryption key') throw error
    const key = randomBytes(32)
    await mkdir(path.dirname(keyPath), { recursive: true, mode: 0o700 })
    await writeFile(keyPath, `${key.toString('base64')}\n`, { encoding: 'utf8', mode: 0o600 })
    await chmod(keyPath, 0o600)
    return key
  }
}

async function encrypt(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', await encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

async function decrypt(value) {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    await encryptionKey(),
    Buffer.from(value.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

function ask(label, fallback) {
  return new Promise((resolve) => {
    process.stdout.write(`${label}${fallback ? ` [${fallback}]` : ''}: `)
    process.stdin.resume()
    process.stdin.once('data', (data) => {
      const value = data.toString().trim()
      resolve(value || fallback)
    })
  })
}

function askSecret(label) {
  return new Promise((resolve) => {
    process.stdout.write(`${label}: `)
    const stdin = process.stdin
    let value = ''
    stdin.setRawMode?.(true)
    stdin.resume()
    const onData = (data) => {
      const text = data.toString()
      if (text === '\n' || text === '\r' || text === '\u0004') {
        stdin.setRawMode?.(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(value)
      } else if (text === '\u0003') {
        process.stdout.write('\n')
        process.exit(130)
      } else if (text === '\u007f') {
        value = value.slice(0, -1)
      } else {
        value += text
      }
    }
    stdin.on('data', onData)
  })
}

async function readStdinSecret() {
  let value = ''
  for await (const chunk of process.stdin) value += chunk.toString()
  return value.trim()
}

function normaliseUrl(value) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString().replace(/\/$/, '')
      : null
  } catch {
    return null
  }
}
