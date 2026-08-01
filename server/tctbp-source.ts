import { randomUUID } from 'node:crypto'
import { lstat, mkdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  RepositoryObservation,
  ScaffoldHealthObservation,
} from '../shared/inspection'
import type {
  CanonicalSourceSummary,
  TctbpApplyRequest,
  TctbpApplyResult,
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
import { AdviserError } from './errors'
import { assessTctbpUpgrade } from './tctbp-upgrade-assessment'
import { fingerprintTctbpPlan } from './tctbp-plan-fingerprint'
import {
  isPathContained,
  readBoundedRepositoryFile,
} from './security'

const VERSION_PATH = 'VERSION'

interface LoadedCanonicalSource extends CanonicalSourceSummary {
  managedPaths: string[]
  policy: TctbpPolicySnapshot | null
}

interface UpgradeTargetObservation {
  head: Pick<RepositoryObservation['head'], 'branch' | 'detached' | 'sha'>
  operations: RepositoryObservation['operations']
  workingTree: Pick<RepositoryObservation['workingTree'], 'clean'>
  tctbp: {
    branchModel: Pick<
      RepositoryObservation['tctbp']['branchModel'],
      'workingBranch' | 'preProductionBranch' | 'productionBranch'
    >
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
      branch: targetObservation.head.branch,
      headSha: targetObservation.head.sha,
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

  async apply(
    targetRoot: string,
    targetObservation: UpgradeTargetObservation,
    request: TctbpApplyRequest,
  ): Promise<TctbpApplyResult> {
    const plan = await this.plan(targetRoot, targetObservation)
    if (!plan.fingerprint || request.planFingerprint !== plan.fingerprint) {
      throw new AdviserError(
        'upgrade-plan-stale',
        'The upgrade plan is stale; generate a new plan before applying changes.',
      )
    }
    if (plan.blockers.length > 0 || plan.disposition !== 'review-required') {
      throw new AdviserError(
        'upgrade-apply-blocked',
        'The upgrade plan is not eligible for application.',
      )
    }
    if (!targetObservation.head.branch || isEnvironmentBranch(targetObservation)) {
      throw new AdviserError(
        'upgrade-environment-branch',
        'Create a dedicated upgrade branch before applying TCTBP infrastructure changes.',
      )
    }

    const approvedPaths = new Set(request.approvedPaths)
    const managedChanges = plan.drift.files.filter((file) => (
      file.action === 'add' || file.action === 'review'
    ))
    if (request.mode === 'approved-managed-files') {
      const unmanaged = request.approvedPaths.filter((filePath) => (
        !managedChanges.some((file) => file.path === filePath)
      ))
      if (unmanaged.length > 0) {
        throw new AdviserError(
          'upgrade-path-not-managed',
          'The apply request contains a path outside the current managed plan.',
        )
      }
    }

    const filesToApply = managedChanges.filter((file) => (
      request.mode === 'additions-only'
        ? file.action === 'add'
        : approvedPaths.has(file.path)
    ))
    const source = await this.loadSource()
    if (source.state !== 'available' || !this.sourceRoot) {
      throw new AdviserError(
        'upgrade-source-unavailable',
        'The canonical source is unavailable; no changes were applied.',
      )
    }
    if (source.revision !== plan.source.revision) {
      throw new AdviserError(
        'upgrade-source-changed',
        'The canonical source changed after the plan was generated.',
      )
    }
    const sourceFiles = await readFiles(
      this.sourceRoot,
      filesToApply.map((file) => file.path),
    )
    if (filesToApply.some((file) => !sourceFiles.has(file.path))) {
      throw new AdviserError(
        'upgrade-source-file-unavailable',
        'A selected canonical managed file is unavailable; no changes were applied.',
      )
    }
    for (const file of filesToApply) {
      await writeManagedFile(targetRoot, file.path, sourceFiles.get(file.path) as string)
    }

    return {
      status: filesToApply.length > 0 ? 'applied' : 'nothing-to-apply',
      appliedPaths: filesToApply.map((file) => file.path),
      planFingerprint: plan.fingerprint,
      committed: false,
      pushed: false,
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

function isEnvironmentBranch(observation: UpgradeTargetObservation): boolean {
  const branch = observation.head.branch
  return [
    observation.tctbp.branchModel.workingBranch,
    observation.tctbp.branchModel.preProductionBranch,
    observation.tctbp.branchModel.productionBranch,
  ].includes(branch)
}

async function writeManagedFile(
  repositoryRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const candidate = path.resolve(repositoryRoot, relativePath)
  if (!isPathContained(repositoryRoot, candidate)) {
    throw new AdviserError(
      'upgrade-path-outside-root',
      'A managed upgrade path escapes the target repository.',
    )
  }
  const parent = path.dirname(candidate)
  await mkdir(parent, { recursive: true })
  const resolvedParent = await realpath(parent)
  if (!isPathContained(repositoryRoot, resolvedParent)) {
    throw new AdviserError(
      'upgrade-parent-outside-root',
      'A managed upgrade directory resolves outside the target repository.',
    )
  }
  try {
    const stats = await lstat(candidate)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new AdviserError(
        'upgrade-target-entry-invalid',
        'A managed target entry is not a regular file.',
      )
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error
  }

  const temporary = path.join(
    parent,
    `.${path.basename(candidate)}.tctbp-${randomUUID()}.tmp`,
  )
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, candidate)
  } finally {
    await unlink(temporary).catch(() => undefined)
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

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT'
  )
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
      environmentBranch: isEnvironmentBranch(targetObservation),
    },
  })

  const plan = {
    ...assessment,
    source: withoutManagedPaths(source),
    target,
    drift,
    policy,
  }
  return {
    ...plan,
    fingerprint: fingerprintTctbpPlan(plan),
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
