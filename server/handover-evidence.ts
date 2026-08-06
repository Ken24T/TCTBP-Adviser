import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { HandoverEvidence } from '../shared/handover'

export class HandoverEvidenceStore {
  readonly #filePath: string
  #loaded = false
  #entries: HandoverEvidence[] = []

  constructor(filePath = path.join(
    process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'),
    'tctbp-adviser',
    'handover-evidence.json',
  )) {
    this.#filePath = path.resolve(filePath)
  }

  async get(repositoryId: string, branch: string | null, commitSha: string | null): Promise<HandoverEvidence | null> {
    await this.load()
    return this.#entries.find((entry) => (
      entry.repositoryId === repositoryId
      && entry.branch === branch
      && entry.commitSha === commitSha
    )) ?? null
  }

  async record(evidence: HandoverEvidence): Promise<void> {
    await this.load()
    this.#entries = [
      evidence,
      ...this.#entries.filter((entry) => !(
        entry.repositoryId === evidence.repositoryId
        && entry.branch === evidence.branch
        && entry.commitSha === evidence.commitSha
      )),
    ].slice(0, 200)
    await mkdir(path.dirname(this.#filePath), { recursive: true, mode: 0o700 })
    await writeFile(this.#filePath, `${JSON.stringify(this.#entries, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await chmod(this.#filePath, 0o600)
  }

  private async load(): Promise<void> {
    if (this.#loaded) return
    this.#loaded = true
    try {
      const parsed = JSON.parse(await readFile(this.#filePath, 'utf8')) as unknown
      this.#entries = Array.isArray(parsed) ? parsed.filter(isHandoverEvidence) : []
    } catch {
      this.#entries = []
    }
  }
}

function isHandoverEvidence(value: unknown): value is HandoverEvidence {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.repositoryId === 'string'
    && typeof entry.branch === 'string'
    && typeof entry.commitSha === 'string'
    && typeof entry.completedAt === 'string'
    && entry.workflow === 'handover'
    && entry.workflowCompleted === true
    && typeof entry.summary === 'string'
  )
}
