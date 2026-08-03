import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { DeploymentEvidence } from '../shared/deployment'

export class DeploymentEvidenceStore {
  readonly #filePath: string
  #loaded = false
  #entries: DeploymentEvidence[] = []

  constructor(filePath = path.join(
    process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'),
    'tctbp-adviser',
    'deployment-evidence.json',
  )) {
    this.#filePath = path.resolve(filePath)
  }

  async get(
    repositoryId: string,
    environment: DeploymentEvidence['environment'],
    branch: string | null,
    commitSha: string | null,
  ): Promise<DeploymentEvidence | null> {
    await this.load()
    return this.#entries.find((entry) => (
      entry.repositoryId === repositoryId
      && entry.environment === environment
      && entry.branch === branch
      && entry.commitSha === commitSha
    )) ?? null
  }

  async record(evidence: DeploymentEvidence): Promise<void> {
    await this.load()
    this.#entries = [
      evidence,
      ...this.#entries.filter((entry) => !(
        entry.repositoryId === evidence.repositoryId
        && entry.environment === evidence.environment
        && entry.branch === evidence.branch
        && entry.commitSha === evidence.commitSha
      )),
    ].slice(0, 200)
    await mkdir(path.dirname(this.#filePath), { recursive: true, mode: 0o700 })
    await writeFile(this.#filePath, `${JSON.stringify(this.#entries, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    await chmod(this.#filePath, 0o600)
  }

  private async load(): Promise<void> {
    if (this.#loaded) return
    this.#loaded = true
    try {
      const parsed = JSON.parse(await readFile(this.#filePath, 'utf8')) as unknown
      this.#entries = Array.isArray(parsed)
        ? parsed.filter(isDeploymentEvidence)
        : []
    } catch {
      this.#entries = []
    }
  }
}

function isDeploymentEvidence(value: unknown): value is DeploymentEvidence {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.repositoryId === 'string'
    && entry.environment === 'development'
    && typeof entry.branch === 'string'
    && typeof entry.commitSha === 'string'
    && typeof entry.completedAt === 'string'
    && entry.workflow === 'deploy-development'
    && entry.workflowCompleted === true
    && (
      entry.runtimeVerification === 'verified'
      || entry.runtimeVerification === 'not-configured'
      || entry.runtimeVerification === 'not-verified'
    )
    && typeof entry.summary === 'string'
  )
}
