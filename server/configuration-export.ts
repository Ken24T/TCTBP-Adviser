import type { SafeConfigurationExport } from '../shared/diagnostics'
import { safeAiSettings } from './ai-settings'
import type { ServiceConfig } from './config'

export function safeConfigurationExport(
  config: ServiceConfig,
  now = new Date(),
): SafeConfigurationExport {
  return {
    version: 1,
    generatedAt: now.toISOString(),
    discovery: {
      repositoryRootCount: config.repositoryRoots.length,
      excludedDirectoryNames: [...config.excludeDirectories],
      maximumDepth: config.maximumDepth,
      maximumDirectories: config.maximumDirectories,
      maximumRepositories: config.maximumRepositories,
      cacheTtlMs: config.portfolioCacheTtlMs,
      inspectionConcurrency: config.inspectionConcurrency,
    },
    gitInspection: {
      timeoutMs: config.commandTimeoutMs,
      maximumOutputBytes: config.commandMaxOutputBytes,
    },
    github: {
      enabled: config.github.enabled,
      tokenConfigured: config.github.token !== null,
      configuredRepositoryCount: config.github.repositories.length,
      timeoutMs: config.github.timeoutMs,
      maximumResponseBytes: config.github.maxResponseBytes,
      cacheTtlMs: config.github.cacheTtlMs,
      concurrency: config.github.concurrency,
    },
    ai: safeAiSettings(config.ai ?? {
      enabled: false,
      apiKey: null,
      baseUrl: null,
      model: null,
      timeoutMs: 30_000,
      maximumResponseBytes: 512 * 1024,
    }),
    omissions: {
      repositoryPaths: true,
      githubToken: true,
    },
  }
}
