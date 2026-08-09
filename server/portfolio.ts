import type { RepositoryObservation } from '../shared/inspection'
import type {
  PortfolioRepository,
  PortfolioSnapshot,
} from '../shared/portfolio'
import type { ServiceConfig } from './config'
import { errorCode } from './errors'
import type { GitHubEnrichmentService } from './github-enrichment'
import type { CanonicalTctbpSourceService } from './tctbp-source'
import {
  summarizePortfolioUpgrades,
  summarizeUpgradePlan,
} from './tctbp-portfolio'
import { resolveRepositoryFavicon } from './favicon'
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
    readonly github: GitHubEnrichmentService,
    readonly tctbpSource: CanonicalTctbpSourceService | null = null,
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

  /** Drops the cached snapshot so the next read re-inspects repositories. */
  invalidate(): void {
    this.#cached = null
  }

  /**
   * Re-inspects a single registered repository and swaps its summary into the
   * cached snapshot, recomputing the aggregate counts. Used for the per-card
   * "Refresh" action on the portfolio dashboard.
   */
  async refreshRepository(repositoryId: string): Promise<PortfolioSnapshot> {
    const repository = await this.registry.require(repositoryId)
    const refreshed = await this.summarise(repository, true)
    const base = this.#cached ?? await this.get(true)
    const repositories = base.repositories.map((candidate) => (
      candidate.id === repositoryId ? refreshed : candidate
    ))
    const snapshot: PortfolioSnapshot = {
      ...base,
      generatedAt: new Date().toISOString(),
      cache: {
        status: 'refreshed',
        ageMs: 0,
        ttlMs: this.config.portfolioCacheTtlMs,
      },
      github: {
        enabled: this.config.github.enabled,
        localMappings: repositories.filter(
          (candidate) => candidate.github.status === 'available'
            || candidate.github.status === 'unavailable',
        ).length,
        githubOnly: repositories.filter(
          (candidate) => candidate.source === 'github-only',
        ).length,
        unavailable: repositories.filter(
          (candidate) => candidate.github.status === 'unavailable',
        ).length,
      },
      upgrade: summarizePortfolioUpgrades(repositories),
      repositories,
    }
    this.#cached = snapshot
    return snapshot
  }

  private async refresh(forceDiscovery: boolean): Promise<PortfolioSnapshot> {
    const registry = await this.registry.snapshot(forceDiscovery)
    const repositories = await mapWithConcurrency(
      registry.repositories,
      this.config.inspectionConcurrency,
      (repository) => this.summarise(repository, forceDiscovery),
    )
    const mappedNames = new Set(repositories.flatMap((repository) => {
      const evidence = repository.github
      if (
        evidence.status === 'available'
        || evidence.status === 'unavailable'
      ) return [evidence.repository.fullName.toLocaleLowerCase()]
      return []
    }))
    const githubOnly = await this.github.githubOnly(
      mappedNames,
      forceDiscovery,
    )
    const allRepositories = [
      ...repositories,
      ...githubOnly.map(githubOnlySummary),
    ]
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
      github: {
        enabled: this.config.github.enabled,
        localMappings: repositories.filter(
          (repository) => repository.github.status === 'available'
            || repository.github.status === 'unavailable',
        ).length,
        githubOnly: githubOnly.length,
        unavailable: allRepositories.filter(
          (repository) => repository.github.status === 'unavailable',
        ).length,
      },
      upgrade: summarizePortfolioUpgrades(allRepositories),
      repositories: allRepositories,
    }
    this.#cached = snapshot
    return snapshot
  }

  private async summarise(
    repository: RegisteredRepository,
    forceGitHub: boolean,
  ): Promise<PortfolioRepository> {
    const [inspectionResult, githubResult] = await Promise.allSettled([
      this.inspections.inspect(repository),
      this.github.forLocal(repository, forceGitHub),
    ])
    const github = githubResult.status === 'fulfilled'
      ? githubResult.value
      : {
        status: 'not-mapped',
        basis: 'github-rest-api',
        retrievedAt: null,
      } as const
    const faviconPath = await resolveRepositoryFavicon(repository.path)
    const directoryName = repository.name
    if (inspectionResult.status === 'fulfilled') {
      const upgrade = this.tctbpSource?.sourceRoot
        ? await this.tctbpSource.plan(repository.path, inspectionResult.value)
          .then(summarizeUpgradePlan)
          .catch(() => null)
        : null
      return availableSummary(
        inspectionResult.value,
        github,
        upgrade,
        { directoryName, faviconPath },
      )
    } else {
      return {
        id: repository.id,
        name: repository.name,
        source: 'local',
        available: false,
        observedAt: null,
        head: null,
        workingTree: null,
        localTracking: null,
        tctbp: null,
        recommendation: null,
        error: {
          code: errorCode(inspectionResult.reason),
          message: 'Local repository inspection failed safely.',
        },
        directoryName,
        faviconPath,
        github,
        upgrade: null,
      }
    }
  }
}

function availableSummary(
  observation: RepositoryObservation,
  github: PortfolioRepository['github'],
  upgrade: PortfolioRepository['upgrade'],
  options: { directoryName: string; faviconPath: string | null },
): PortfolioRepository {
  const recommendation = recommend(observation, 'none', new Date())
  return {
    id: observation.repository.id,
    name: observation.repository.name,
    source: 'local',
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
    directoryName: options.directoryName,
    faviconPath: options.faviconPath,
    github,
    upgrade,
  }
}

function githubOnlySummary(
  repository: Awaited<ReturnType<GitHubEnrichmentService['githubOnly']>>[number],
): PortfolioRepository {
  return {
    id: repository.id,
    name: repository.name,
    source: 'github-only',
    available: true,
    observedAt: null,
    head: null,
    workingTree: null,
    localTracking: null,
    tctbp: null,
    recommendation: null,
    error: null,
    github: repository.evidence,
    upgrade: null,
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
