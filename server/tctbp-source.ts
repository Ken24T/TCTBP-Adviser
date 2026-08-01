import type {
  RepositoryObservation,
  ScaffoldHealthObservation,
} from '../shared/inspection'
import type {
  CanonicalSourceSummary,
  TctbpPolicyComparison,
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
import {
  compareTctbpPolicy,
  parseTctbpPolicy,
  type TctbpPolicySnapshot,
} from './tctbp-policy'
import { assessTctbpUpgrade } from './tctbp-upgrade-assessment'
import { readBoundedRepositoryFile } from './security'

const VERSION_PATH = 'VERSION'

interface LoadedCanonicalSource extends CanonicalSourceSummary {
  managedPaths: string[]
  policy: TctbpPolicySnapshot | null
}

interface UpgradeTargetObservation {
  head: Pick<RepositoryObservation['head'], 'detached'>
  operations: RepositoryObservation['operations']
  workingTree: Pick<RepositoryObservation['workingTree'], 'clean'>
  tctbp: {
    scaffold: Pick<
      ScaffoldHealthObservation,
      'sourceRepository' | 'sourceRevision' | 'sourceVersion'
    >
  }
}

export class CanonicalTctbpSourceService {
  constructor(
    readonly sourceRoot: string | null,
    readonly executor: GitExecutor,
  ) {}

  async plan(
    targetRoot: string,
    targetObservation: UpgradeTargetObservation,
  ): Promise<TctbpUpgradePlan> {
    const sourceRoot = this.sourceRoot
    const source = await this.loadSource()
    const target = {
      sourceRepository: targetObservation.tctbp.scaffold.sourceRepository,
      sourceRevision: targetObservation.tctbp.scaffold.sourceRevision,
      sourceVersion: targetObservation.tctbp.scaffold.sourceVersion,
    }

    if (source.state !== 'available' || !sourceRoot) {
      return createPlan(
        source,
        target,
        emptyManagedFileDriftPlan(),
        { state: 'unavailable', differences: [] },
        targetObservation,
      )
    }

    const [sourceFiles, targetFiles, targetPolicyContent] = await Promise.all([
      readFiles(sourceRoot, source.managedPaths),
      readFiles(targetRoot, source.managedPaths),
      readBoundedRepositoryFile(targetRoot, '.github/TCTBP.json'),
    ])
    const policy = compareTctbpPolicy(
      source.policy,
      parseTctbpPolicy(targetPolicyContent),
    )
    const drift = planManagedFileDrift(
      source.managedPaths,
      sourceFiles,
      targetFiles,
    )

    return createPlan(
      source,
      target,
      drift,
      policy,
      targetObservation,
    )
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
        policy: null,
      }
    }

    try {
      const [head, runner, version, policyContent] = await Promise.all([
        this.executor.run(sourceRoot, GIT_COMMANDS.head),
        readBoundedRepositoryFile(sourceRoot, SCAFFOLD_RUNNER_PATH),
        readBoundedRepositoryFile(sourceRoot, VERSION_PATH),
        readBoundedRepositoryFile(sourceRoot, '.github/TCTBP.json'),
      ])
      if (runner === null || policyContent === null) {
        return unavailableSource('The canonical TCTBP-Web policy surface is unavailable.')
      }

      const managedPaths = parseCanonicalManagedSurface(runner)
      const policy = parseTctbpPolicy(policyContent)
      if (!policy) {
        return unavailableSource('The canonical TCTBP-Web policy is invalid.')
      }
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
        policy,
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
    policy: null,
  }
}

function createPlan(
  source: LoadedCanonicalSource,
  target: TctbpUpgradePlan['target'],
  drift: TctbpUpgradePlan['drift'],
  policy: TctbpPolicyComparison,
  targetObservation: UpgradeTargetObservation,
): TctbpUpgradePlan {
  const assessment = assessTctbpUpgrade({
    source: withoutManagedPaths(source),
    target,
    drift,
    policy,
    targetState: {
      detached: targetObservation.head.detached,
      operationCount: targetObservation.operations.length,
      workingTreeClean: targetObservation.workingTree.clean,
    },
  })

  return {
    ...assessment,
    source: withoutManagedPaths(source),
    target,
    drift,
    policy,
  }
}

function withoutManagedPaths(
  source: LoadedCanonicalSource,
): CanonicalSourceSummary {
  const {
    managedPaths: _managedPaths,
    policy: _policy,
    ...summary
  } = source
  return summary
}
