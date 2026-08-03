export interface InspectionAuditEntry {
  id: string
  repositoryId: string
  startedAt: string
  completedAt: string
  durationMs: number
  outcome: 'success' | 'failure'
  errorCode: string | null
}

export interface SafeConfigurationExport {
  version: 1
  generatedAt: string
  discovery: {
    repositoryRootCount: number
    excludedDirectoryNames: string[]
    maximumDepth: number
    maximumDirectories: number
    maximumRepositories: number
    cacheTtlMs: number
    inspectionConcurrency: number
  }
  gitInspection: {
    timeoutMs: number
    maximumOutputBytes: number
  }
  github: {
    enabled: boolean
    tokenConfigured: boolean
    configuredRepositoryCount: number
    timeoutMs: number
    maximumResponseBytes: number
    cacheTtlMs: number
    concurrency: number
  }
  ai: {
    enabled: boolean
    configured: boolean
    baseUrl: string | null
    model: string | null
    timeoutMs: number
    maximumOutputTokens: number
    maximumResponseBytes: number
  }
  omissions: {
    repositoryPaths: true
    githubToken: true
  }
}
