import { createHash } from 'node:crypto'
import type { RepositorySummary } from '../shared/inspection'
import type {
  DiscoveryIssue,
  DiscoverySnapshot,
  RepositoryDiscovery,
} from './discovery'
import { AdviserError } from './errors'

export interface RegisteredRepository extends RepositorySummary {
  path: string
}

export interface RegistrySnapshot {
  scannedAt: string
  repositories: RegisteredRepository[]
  issues: DiscoveryIssue[]
}

export class RepositoryRegistry {
  #snapshot: RegistrySnapshot | null = null
  #refreshing: Promise<RegistrySnapshot> | null = null

  constructor(
    readonly discovery: RepositoryDiscovery,
    readonly cacheTtlMs: number,
  ) {}

  async list(): Promise<RepositorySummary[]> {
    const snapshot = await this.snapshot()
    return snapshot.repositories.map(({ id, name }) => ({ id, name }))
  }

  async require(id: string): Promise<RegisteredRepository> {
    const snapshot = await this.snapshot()
    const repository = snapshot.repositories.find(
      (candidate) => candidate.id === id,
    )
    if (repository) return repository
    throw new AdviserError(
      'repository-not-found',
      'The requested repository is not registered.',
    )
  }

  async snapshot(force = false): Promise<RegistrySnapshot> {
    if (!force && this.#snapshot && this.isFresh(this.#snapshot)) {
      return this.#snapshot
    }
    if (this.#refreshing) return this.#refreshing
    this.#refreshing = this.refreshNow()
    try {
      return await this.#refreshing
    } finally {
      this.#refreshing = null
    }
  }

  private async refreshNow(): Promise<RegistrySnapshot> {
    const discovered = await this.discovery.scan()
    const snapshot = register(discovered)
    this.#snapshot = snapshot
    return snapshot
  }

  private isFresh(snapshot: RegistrySnapshot): boolean {
    const scannedAt = Date.parse(snapshot.scannedAt)
    return (
      Number.isFinite(scannedAt)
      && Date.now() - scannedAt <= this.cacheTtlMs
    )
  }
}

function register(snapshot: DiscoverySnapshot): RegistrySnapshot {
  return {
    scannedAt: snapshot.scannedAt,
    issues: [...snapshot.issues],
    repositories: snapshot.repositories.map((repository) => ({
      id: createHash('sha256')
        .update(repository.path)
        .digest('base64url')
        .slice(0, 24),
      name: repository.name,
      path: repository.path,
    })),
  }
}
