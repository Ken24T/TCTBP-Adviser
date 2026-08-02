import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat, mkdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  RepositoryObservation,
  ScaffoldHealthObservation,
} from '../shared/inspection'
import type {
  TctbpBootstrapApplyRequest,
  TctbpBootstrapApplyResult,
  TctbpBootstrapPlan,
  TctbpBootstrapRequest,
} from '../shared/tctbp-bootstrap'
import type {
  CanonicalSourceSummary,
  TctbpApplyRequest,
  TctbpApplyResult,
  TctbpPolicyComparison,
  TctbpUpgradePlan,
} from '../shared/tctbp-upgrade'
import {
  emptyManagedFileDriftPlan,
  hashFileContent,
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
  mergeCanonicalTctbpPolicy,
  parseTctbpPolicy,
  type TctbpPolicySnapshot,
} from './tctbp-policy'
import { AdviserError } from './errors'
import { assessTctbpUpgrade } from './tctbp-upgrade-assessment'
import { fingerprintTctbpPlan } from './tctbp-plan-fingerprint'
import { listManagedSurfaceFiles } from './tctbp-target-manifest'
import {
  buildBootstrapPlan,
  generateBootstrapPolicy,
} from './tctbp-bootstrap'
import {
  isPathContained,
  readBoundedRepositoryFile,
} from './security'

const VERSION_PATH = 'VERSION'
const execFileAsync = promisify(execFile)

interface LoadedCanonicalSource extends CanonicalSourceSummary {
  managedPaths: string[]
  policy: TctbpPolicySnapshot | null
  policyContent: string | null
}

interface UpgradeTargetObservation {
  head: Pick<RepositoryObservation['head'], 'branch' | 'detached' | 'sha'>
  operations: RepositoryObservation['operations']
  workingTree: Pick<RepositoryObservation['workingTree'], 'clean'>
  tctbp: {
    installed: RepositoryObservation['tctbp']['installed']
    branchModel: Pick<
      RepositoryObservation['tctbp']['branchModel'],
      'workingBranch' | 'preProductionBranch' | 'productionBranch'
    >
    scaffold: Pick<
      ScaffoldHealthObservation,
      'sourceRepository' | 'sourceRevision' | 'sourceVersion'
    > & { managedSurface?: string[] }
  }
}

export class CanonicalTctbpSourceService {
  constructor(
    readonly sourceRoot: string | null,
    readonly executor: GitExecutor,
  ) {}

  async bootstrapPlan(
    targetObservation: UpgradeTargetObservation,
    request: TctbpBootstrapRequest,
  ): Promise<TctbpBootstrapPlan> {
    const source = await this.loadSource()
    return buildBootstrapPlan(
      withoutManagedPaths(source),
      {
        branch: targetObservation.head.branch,
        clean: targetObservation.workingTree.clean,
        detached: targetObservation.head.detached,
        operationCount: targetObservation.operations.length,
      },
      request,
    )
  }

  async bootstrapApply(
    targetRoot: string,
    targetObservation: UpgradeTargetObservation,
    request: TctbpBootstrapApplyRequest,
  ): Promise<TctbpBootstrapApplyResult> {
    const source = await this.loadSource()
    const plan = buildBootstrapPlan(
      withoutManagedPaths(source),
      {
        branch: targetObservation.head.branch,
        clean: targetObservation.workingTree.clean,
        detached: targetObservation.head.detached,
        operationCount: targetObservation.operations.length,
      },
      request.request,
    )
    if (!plan.fingerprint || request.planFingerprint !== plan.fingerprint) {
      throw new AdviserError(
        'bootstrap-plan-stale',
        'The bootstrap plan is stale; prepare a new plan before applying.',
      )
    }
    if (
      source.state !== 'available'
      || !this.sourceRoot
      || !source.policyContent
      || !targetObservation.workingTree.clean
      || targetObservation.operations.length > 0
      || targetObservation.head.detached
    ) {
      throw new AdviserError(
        'bootstrap-apply-blocked',
        'Bootstrap is blocked by source or target repository state.',
      )
    }
    const branch = plan.recommendedBranch
    if (!branch) throw new AdviserError('bootstrap-branch-invalid', 'Bootstrap branch could not be generated.')
    await execFileAsync('git', ['switch', '-c', branch], { cwd: targetRoot })

    const sourceFiles = await readFiles(this.sourceRoot, source.managedPaths)
    const policy = generateBootstrapPolicy(source.policyContent, request.request)
    if (!policy) throw new AdviserError('bootstrap-policy-invalid', 'Bootstrap policy could not be generated.')
    const sourceJson = JSON.stringify({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: source.revision,
      sourceVersion: source.version,
      installedSchemaVersion: 11,
      adviserContract: {
        major: 1,
        minor: 0,
        capabilities: ['inspection.local-v1', 'workflow-catalogue.core-v1', 'reason-codes.core-v1'],
      },
      installedAt: new Date().toISOString().slice(0, 10),
      managedSurface: source.managedPaths,
    }, null, 2) + '\n'
    const appliedPaths: string[] = []
    for (const [filePath, content] of sourceFiles) {
      if (!request.request.includeHookLayer && filePath.startsWith('.github/hooks/')) continue
      await writeManagedFile(targetRoot, filePath, content)
      appliedPaths.push(filePath)
    }
    await writeManagedFile(targetRoot, '.github/TCTBP.json', policy)
    await writeManagedFile(targetRoot, '.tctbp/source.json', sourceJson)
    appliedPaths.push('.github/TCTBP.json', '.tctbp/source.json')
    return {
      status: 'applied',
      branch,
      appliedPaths,
      planFingerprint: plan.fingerprint,
      committed: false,
      pushed: false,
    }
  }

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

    const targetManagedPaths = await listManagedSurfaceFiles(
      targetRoot,
      targetObservation.tctbp.scaffold.managedSurface ?? [],
    )
    const obsoletePaths = targetManagedPaths.filter(
      (filePath) => !source.managedPaths.includes(filePath),
    )
    const [sourceFiles, targetFiles, targetPolicyContent, obsoleteFiles] = await Promise.all([
      readFiles(sourceRoot, source.managedPaths),
      readFiles(targetRoot, source.managedPaths),
      readBoundedRepositoryFile(targetRoot, '.github/TCTBP.json'),
      readFiles(targetRoot, obsoletePaths),
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
    drift.obsoleteTargets = obsoletePaths.flatMap((filePath) => {
      const content = obsoleteFiles.get(filePath)
      return content === undefined
        ? []
        : [{ path: filePath, targetHash: hashFileContent(content) }]
    })

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
    const policyApproved = (
      request.mode === 'approved-managed-files'
      && approvedPaths.has('.github/TCTBP.json')
      && plan.policy.state === 'drifted'
    )
    if (request.mode === 'approved-managed-files') {
      const unmanaged = request.approvedPaths.filter((filePath) => (
        filePath !== '.github/TCTBP.json'
        && !managedChanges.some((file) => file.path === filePath)
      ))
      if (unmanaged.length > 0 || (
        approvedPaths.has('.github/TCTBP.json') && !policyApproved
      )) {
        throw new AdviserError(
          'upgrade-path-not-managed',
          'The apply request contains a path outside the current managed plan.',
        )
      }
    }
    const obsoleteTargets = plan.drift.obsoleteTargets ?? []
    const deletionPaths = Array.from(new Set(request.approvedDeletionPaths))
    if (deletionPaths.length > 0) {
      if (!request.confirmDeletions) {
        throw new AdviserError(
          'upgrade-deletion-confirmation-required',
          'Obsolete managed-file deletion requires explicit confirmation.',
        )
      }
      const unknownDeletions = deletionPaths.filter((filePath) => (
        !obsoleteTargets.some((file) => file.path === filePath)
      ))
      if (unknownDeletions.length > 0) {
        throw new AdviserError(
          'upgrade-deletion-not-managed',
          'The apply request contains a path outside the obsolete managed-file plan.',
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
    const targetPolicyContent = policyApproved
      ? await readBoundedRepositoryFile(targetRoot, '.github/TCTBP.json')
      : null
    const mergedPolicy = policyApproved
      ? mergeCanonicalTctbpPolicy(source.policyContent, targetPolicyContent)
      : null
    if (policyApproved && mergedPolicy === null) {
      throw new AdviserError(
        'upgrade-policy-merge-unavailable',
        'The canonical and target TCTBP policies could not be safely merged.',
      )
    }
    if (filesToApply.some((file) => !sourceFiles.has(file.path))) {
      throw new AdviserError(
        'upgrade-source-file-unavailable',
        'A selected canonical managed file is unavailable; no changes were applied.',
      )
    }
    for (const file of filesToApply) {
      await writeManagedFile(targetRoot, file.path, sourceFiles.get(file.path) as string)
    }
    if (mergedPolicy !== null) {
      await writeManagedFile(targetRoot, '.github/TCTBP.json', mergedPolicy)
    }
    for (const filePath of deletionPaths) {
      await deleteManagedFile(targetRoot, filePath)
    }

    const appliedPaths = [
      ...filesToApply.map((file) => file.path),
      ...(mergedPolicy !== null ? ['.github/TCTBP.json'] : []),
      ...deletionPaths.map((filePath) => `deleted:${filePath}`),
    ]
    return {
      status: appliedPaths.length > 0 ? 'applied' : 'nothing-to-apply',
      appliedPaths,
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
        policyContent: null,
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
        policyContent,
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

async function deleteManagedFile(
  repositoryRoot: string,
  relativePath: string,
): Promise<void> {
  const candidate = path.resolve(repositoryRoot, relativePath)
  if (!isPathContained(repositoryRoot, candidate)) {
    throw new AdviserError(
      'upgrade-path-outside-root',
      'An obsolete managed path escapes the target repository.',
    )
  }
  const stats = await lstat(candidate)
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new AdviserError(
      'upgrade-target-entry-invalid',
      'An obsolete managed entry is not a regular file.',
    )
  }
  await unlink(candidate)
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
    policyContent: null,
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
      tctbpInstalled: targetObservation.tctbp.installed,
      targetPolicyAvailable: policy.state !== 'unavailable',
    },
  })

  const plan = {
    ...assessment,
    source: withoutManagedPaths(source),
    target,
    drift,
    policy,
    ...(assessment.disposition === 'bootstrap-required'
      ? {
        bootstrap: {
          sourceRevision: source.revision,
          sourceVersion: source.version,
          managedFileCount: source.managedFileCount,
          recommendedBranch: target.branch
            ? `upgrade/tctbp-bootstrap-${source.revision?.slice(0, 7) ?? 'source'}`
            : null,
          requiredInputs: [
            'Project name and description',
            'Branch strategy and environment branches',
            'Version source and release policy',
            'Test, build, and deployment commands',
            'Hook layer and local workflow deviations',
          ],
          preserveAreas: [
            'Application source and documentation',
            'Project-specific package commands',
            'Branch and deployment settings',
          ],
          applyAllowed: false as const,
        },
      }
      : {}),
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
    policyContent: _policyContent,
    ...summary
  } = source
  return summary
}
