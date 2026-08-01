import type { ScaffoldHealthObservation } from '../shared/inspection'
import type {
  CanonicalSourceSummary,
  TctbpUpgradePlan,
} from '../shared/tctbp-upgrade'
import {
  emptyManagedFileDriftPlan,
  planManagedFileDrift,
} from './tctbp-drift'
import {
  GIT_COMMANDS,
  type GitExecutor,
} from './git-command'
import {
  parseCanonicalManagedSurface,
  SCAFFOLD_RUNNER_PATH,
} from './tctbp-manifest'
import { readBoundedRepositoryFile } from './security'

const VERSION_PATH = 'VERSION'

interface LoadedCanonicalSource extends CanonicalSourceSummary {
  managedPaths: string[]
}

export class CanonicalTctbpSourceService {
  constructor(
    readonly sourceRoot: string | null,
    readonly executor: GitExecutor,
  ) {}

  async plan(
    targetRoot: string,
    targetScaffold: Pick<
      ScaffoldHealthObservation,
      'sourceRepository' | 'sourceRevision' | 'sourceVersion'
    >,
  ): Promise<TctbpUpgradePlan> {
    const sourceRoot = this.sourceRoot
    const source = await this.loadSource()
    const target = {
      sourceRepository: targetScaffold.sourceRepository,
      sourceRevision: targetScaffold.sourceRevision,
      sourceVersion: targetScaffold.sourceVersion,
    }

    if (source.state !== 'available' || !sourceRoot) {
      return {
        source: withoutManagedPaths(source),
        target,
        drift: emptyManagedFileDriftPlan(),
      }
    }

    const [sourceFiles, targetFiles] = await Promise.all([
      readFiles(sourceRoot, source.managedPaths),
      readFiles(targetRoot, source.managedPaths),
    ])

    return {
      source: withoutManagedPaths(source),
      target,
      drift: planManagedFileDrift(
        source.managedPaths,
        sourceFiles,
        targetFiles,
      ),
    }
  }

  private async loadSource(): Promise<LoadedCanonicalSource> {
    const sourceRoot = this.sourceRoot
    if (!sourceRoot) {
      return {
        state: 'not-configured',
        repository: null,
        revision: null,
        version: null,
        managedFileCount: 0,
        message: 'A canonical TCTBP-Web checkout is not configured.',
        managedPaths: [],
      }
    }

    try {
      const [head, runner, version] = await Promise.all([
        this.executor.run(sourceRoot, GIT_COMMANDS.head),
        readBoundedRepositoryFile(sourceRoot, SCAFFOLD_RUNNER_PATH),
        readBoundedRepositoryFile(sourceRoot, VERSION_PATH),
      ])
      if (runner === null) {
        return unavailableSource('The canonical scaffold runner is unavailable.')
      }

      const managedPaths = parseCanonicalManagedSurface(runner)
      const revision = head.stdout.trim()
      if (!/^[0-9a-f]{40,64}$/i.test(revision)) {
        return unavailableSource('The canonical source revision is unavailable.')
      }

      return {
        state: 'available',
        repository: 'TCTBP-Web',
        revision,
        version: parseVersion(version),
        managedFileCount: managedPaths.length,
        message: null,
        managedPaths,
      }
    } catch {
      return unavailableSource('The canonical TCTBP-Web source could not be inspected.')
    }
  }
}

async function readFiles(
  repositoryRoot: string,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const entries = await Promise.all(paths.map(async (relativePath) => (
    [relativePath, await readBoundedRepositoryFile(repositoryRoot, relativePath)] as const
  )))
  return new Map(entries.filter(
    (entry): entry is readonly [string, string] => entry[1] !== null,
  ))
}

function parseVersion(content: string | null): string | null {
  if (!content) return null
  try {
    const value: unknown = JSON.parse(content)
    if (
      typeof value === 'object'
      && value !== null
      && 'version' in value
      && typeof value.version === 'string'
    ) return value.version
  } catch {
    return content.trim() || null
  }
  return null
}

function unavailableSource(message: string): LoadedCanonicalSource {
  return {
    state: 'unavailable',
    repository: null,
    revision: null,
    version: null,
    managedFileCount: 0,
    message,
    managedPaths: [],
  }
}

function withoutManagedPaths(
  source: LoadedCanonicalSource,
): CanonicalSourceSummary {
  const {
    managedPaths: _managedPaths,
    ...summary
  } = source
  return summary
}
