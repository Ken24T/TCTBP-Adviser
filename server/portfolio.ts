import type { RepositoryObservation } from '../shared/inspection'
import type {
  PortfolioRepository,
  PortfolioSnapshot,
} from '../shared/portfolio'
import type { ServiceConfig } from './config'
import { errorCode } from './errors'
import type { RepositoryInspectionService } from './inspection'
import { recommend } from './recommendations/engine'
import type {
  RegisteredRepository,
  RepositoryRegistry,
} from './registry'

export class PortfolioService {
  #cached: PortfolioSnapshot | null = null
  #refreshing: Promise<PortfolioSnapshot> | null = null

  constructor(
    readonly config: ServiceConfig,
    readonly registry: RepositoryRegistry,
    readonly inspections: RepositoryInspectionService,
  ) {}

  async get(force = false): Promise<PortfolioSnapshot> {
    if (!force && this.#cached && isFresh(
      this.#cached.generatedAt,
      this.config.portfolioCacheTtlMs,
    )) {
      return withCacheStatus(this.#cached, 'fresh')
    }
    if (this.#refreshing) return this.#refreshing
    this.#refreshing = this.refresh(force)
    try {
      return await this.#refreshing
    } finally {
      this.#refreshing = null
    }
  }

  private async refresh(forceDiscovery: boolean): Promise<PortfolioSnapshot> {
    const registry = await this.registry.snapshot(forceDiscovery)
    const repositories = await mapWithConcurrency(
      registry.repositories,
      this.config.inspectionConcurrency,
      (repository) => this.summarise(repository),
    )
    const generatedAt = new Date().toISOString()
    const snapshot: PortfolioSnapshot = {
      generatedAt,
      cache: {
        status: 'refreshed',
        ageMs: 0,
        ttlMs: this.config.portfolioCacheTtlMs,
      },
      discovery: {
        scannedAt: registry.scannedAt,
        repositoryCount: registry.repositories.length,
        rootCount: this.config.repositoryRoots.length,
        issues: [...registry.issues],
      },
      repositories,
    }
    this.#cached = snapshot
    return snapshot
  }

  private async summarise(
    repository: RegisteredRepository,
  ): Promise<PortfolioRepository> {
    try {
      const observation = await this.inspections.inspect(repository)
      return availableSummary(observation)
    } catch (error) {
      return {
        id: repository.id,
        name: repository.name,
        available: false,
        observedAt: null,
        head: null,
        workingTree: null,
        localTracking: null,
        tctbp: null,
        recommendation: null,
        error: {
          code: errorCode(error),
          message: 'Local repository inspection failed safely.',
        },
      }
    }
  }
}

function availableSummary(
  observation: RepositoryObservation,
): PortfolioRepository {
  const recommendation = recommend(observation, 'none', new Date())
  return {
    id: observation.repository.id,
    name: observation.repository.name,
    available: true,
    observedAt: observation.observedAt,
    head: {
      branch: observation.head.branch,
      detached: observation.head.detached,
    },
    workingTree: {
      clean: observation.workingTree.clean,
      pathCount: observation.workingTree.pathCount,
    },
    localTracking: {
      state: observation.localTracking.state,
      ahead: observation.localTracking.ahead,
      behind: observation.localTracking.behind,
    },
    tctbp: {
      installed: observation.tctbp.installed,
      compatible: observation.tctbp.compatible,
      schemaVersion: observation.tctbp.schemaVersion,
    },
    recommendation: {
      disposition: recommendation.disposition,
      primaryAction: recommendation.primaryAction,
      reasonCodes: recommendation.reasonCodes,
      severity: recommendation.severity,
    },
    error: null,
  }
}

function withCacheStatus(
  snapshot: PortfolioSnapshot,
  status: PortfolioSnapshot['cache']['status'],
): PortfolioSnapshot {
  return {
    ...snapshot,
    cache: {
      ...snapshot.cache,
      status,
      ageMs: Math.max(0, Date.now() - Date.parse(snapshot.generatedAt)),
    },
  }
}

function isFresh(observedAt: string, ttlMs: number): boolean {
  const timestamp = Date.parse(observedAt)
  return Number.isFinite(timestamp) && Date.now() - timestamp <= ttlMs
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex++
      results[index] = await mapper(values[index])
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker(),
    ),
  )
  return results
}
