// TCTBP file-size justification: this module owns the canonical-source manager
// class that drives the bootstrap/plan/apply lifecycle end-to-end; its methods
// share the loaded-source state and the same upgrade-domain helpers. The file
// I/O layer (writeManagedFile, deleteManagedFile, readFiles, parseVersion) has
// already been extracted to tctbp-source-files.ts. Further splitting means
// splitting the class itself, deferred as a larger refactor.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
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
  ManagedFileAction,
  TctbpApplyRequest,
  TctbpApplyResult,
  TctbpApplyStep,
  TctbpCleanupResult,
  TctbpMergeResult,
  TctbpPolicyComparison,
  TctbpUpgradeCleanup,
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
import type { BootstrapJobProgress } from './tctbp-bootstrap-jobs'
import { readBoundedRepositoryFile } from './security'
import {
  deleteManagedFile,
  parseVersion,
  readFiles,
  writeManagedFile,
} from './tctbp-source-files'

const VERSION_PATH = 'VERSION'
const SCRIPT_COMPATIBILITY_PATH = 'scripts/package.json'
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
  #sourceRoot: string | null

  constructor(
    sourceRoot: string | null,
    readonly executor: GitExecutor,
  ) {
    this.#sourceRoot = sourceRoot
  }

  get sourceRoot(): string | null {
    return this.#sourceRoot
  }

  setSourceRoot(sourceRoot: string | null): void {
    this.#sourceRoot = sourceRoot
  }

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
    progress?: BootstrapJobProgress,
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
    progress?.('validate', 'Plan and target state verified.')
    const branch = plan.recommendedBranch
    if (!branch) throw new AdviserError('bootstrap-branch-invalid', 'Bootstrap branch could not be generated.')
    progress?.('create-branch', `Creating ${branch}.`)
    await execFileAsync('git', ['switch', '-c', branch], { cwd: targetRoot })

    progress?.('read-source', 'Reading the canonical managed surface.')
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
      managedSurface: [
        ...source.managedPaths.filter((filePath) => (
          request.request.includeHookLayer || !filePath.startsWith('.github/hooks/')
        )),
        SCRIPT_COMPATIBILITY_PATH,
      ],
    }, null, 2) + '\n'
    const appliedPaths: string[] = []
    const writableFiles = Array.from(sourceFiles.entries()).filter(([filePath]) => (
      request.request.includeHookLayer || !filePath.startsWith('.github/hooks/')
    ))
    progress?.('write-managed-files', `Writing 0/${writableFiles.length} managed files.`)
    for (const [index, [filePath, content]] of writableFiles.entries()) {
      await writeManagedFile(targetRoot, filePath, content)
      appliedPaths.push(filePath)
      progress?.(
        'write-managed-files',
        `Writing ${index + 1}/${writableFiles.length}: ${filePath}`,
      )
    }
    progress?.('write-policy', 'Writing generated .github/TCTBP.json.')
    await writeManagedFile(targetRoot, '.github/TCTBP.json', policy)
    await writeManagedFile(
      targetRoot,
      SCRIPT_COMPATIBILITY_PATH,
      '{\n  "type": "commonjs"\n}\n',
    )
    appliedPaths.push(SCRIPT_COMPATIBILITY_PATH)
    progress?.('write-source-metadata', 'Writing .tctbp/source.json.')
    await writeManagedFile(targetRoot, '.tctbp/source.json', sourceJson)
    appliedPaths.push('.github/TCTBP.json', '.tctbp/source.json')
    progress?.('complete', `Applied ${appliedPaths.length} file(s) without commit or push.`)
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
      // When the target is checked out on a configured environment branch,
      // the apply step creates (or reuses) this dedicated upgrade branch so
      // managed-file writes never land directly on development/review/main.
      upgradeBranch: (
        source.state === 'available'
        && isEnvironmentBranch(targetObservation)
      )
        ? upgradeBranchName(source.revision, source.version)
        : null,
    }
    const cleanup = await computeUpgradeCleanup(targetRoot, targetObservation)

    if (source.state !== 'available' || !sourceRoot) {
      return createPlan(
        source,
        target,
        emptyManagedFileDriftPlan(),
        { state: 'unavailable', differences: [] },
        targetObservation,
        cleanup,
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
      cleanup,
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
        'The upgrade plan is blocked — resolve any blockers (e.g. uncommitted local changes) before applying.',
      )
    }
    if (!targetObservation.head.branch) {
      throw new AdviserError(
        'upgrade-no-branch',
        'The target repository has no active branch to apply from.',
      )
    }
    // On a configured environment branch, first move the working tree onto a
    // dedicated upgrade branch (created from the current branch, or reused if
    // a previous attempt left one behind). The apply itself stays strictly
    // working-tree-only: nothing is committed or pushed, and the environment
    // branch history is never touched.
    let branch = targetObservation.head.branch
    let branchCreated = false
    if (isEnvironmentBranch(targetObservation)) {
      const prepared = await prepareUpgradeBranch(
        targetRoot,
        targetObservation,
        plan.source.revision,
        plan.source.version,
      )
      branch = prepared.branch
      branchCreated = prepared.created
    }

    const steps = request.steps && request.steps.length > 0
      ? request.steps
      : [{
          mode: request.mode,
          approvedPaths: request.approvedPaths,
          approvedDeletionPaths: request.approvedDeletionPaths,
          confirmDeletions: request.confirmDeletions,
        }]
    const managedChanges = plan.drift.files.filter((file) => (
      file.action === 'add' || file.action === 'review'
    ))
    const obsoleteTargets = plan.drift.obsoleteTargets ?? []
    // Validate and select what each step touches, all against the single
    // reviewed plan — never a re-planned intermediate state. An ordered
    // "apply in order (N steps)" request therefore applies the whole
    // reviewed plan in one validated pass.
    const selections = steps.map((step) => (
      selectApplyStep(step, plan, managedChanges, obsoleteTargets)
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
    const requiredFiles = Array.from(new Set(selections.flatMap(
      (selection) => selection.filesToApply.map((file) => file.path),
    )))
    const sourceFiles = await readFiles(this.sourceRoot, requiredFiles)
    if (requiredFiles.some((filePath) => !sourceFiles.has(filePath))) {
      throw new AdviserError(
        'upgrade-source-file-unavailable',
        'A selected canonical managed file is unavailable; no changes were applied.',
      )
    }

    const appliedPaths: string[] = []
    for (const selection of selections) {
      for (const file of selection.filesToApply) {
        await writeManagedFile(targetRoot, file.path, sourceFiles.get(file.path) as string)
        appliedPaths.push(file.path)
      }
      if (selection.policyApproved) {
        const targetPolicyContent = await readBoundedRepositoryFile(targetRoot, '.github/TCTBP.json')
        const mergedPolicy = mergeCanonicalTctbpPolicy(source.policyContent, targetPolicyContent)
        if (mergedPolicy === null) {
          throw new AdviserError(
            'upgrade-policy-merge-unavailable',
            'The canonical and target TCTBP policies could not be safely merged.',
          )
        }
        await writeManagedFile(targetRoot, '.github/TCTBP.json', mergedPolicy)
        appliedPaths.push('.github/TCTBP.json')
      }
      for (const filePath of selection.deletionPaths) {
        await deleteManagedFile(targetRoot, filePath)
        appliedPaths.push(`deleted:${filePath}`)
      }
    }

    // Record the canonical alignment in the source manifest, exactly as
    // bootstrap does. Without it the plan cannot verify the target came from
    // TCTBP-Web (alignment stays 'unknown') and can never reach 'current'
    // even after a full reconcile.
    const sourceJson = JSON.stringify({
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: source.revision,
      sourceVersion: source.version,
      installedSchemaVersion: 11,
      adviserContract: {
        major: 1,
        minor: 0,
        capabilities: [
          'inspection.local-v1',
          'workflow-catalogue.core-v1',
          'reason-codes.core-v1',
        ],
      },
      installedAt: new Date().toISOString().slice(0, 10),
      managedSurface: source.managedPaths,
    }, null, 2) + '\n'
    await writeManagedFile(targetRoot, '.tctbp/source.json', sourceJson)
    appliedPaths.push('.tctbp/source.json')

    return {
      status: appliedPaths.length > 0 ? 'applied' : 'nothing-to-apply',
      appliedPaths,
      planFingerprint: plan.fingerprint,
      committed: false,
      pushed: false,
      branch,
      branchCreated,
    }
  }

  /**
   * Removes a leftover upgrade branch once it has been merged back and
   * verified. Re-checks the same safety gates as the plan (fully merged into
   * the current branch, clean working tree, not the checked-out branch) and
   * refuses otherwise. Deletes the local branch and, when present on origin,
   * the remote one. Nothing else is touched.
   */
  async cleanupUpgradeBranch(
    targetRoot: string,
    targetObservation: UpgradeTargetObservation,
  ): Promise<TctbpCleanupResult> {
    const cleanup = await computeUpgradeCleanup(targetRoot, targetObservation)
    if (!cleanup?.branch) {
      throw new AdviserError(
        'upgrade-cleanup-unavailable',
        'There is no upgrade branch to clean up.',
      )
    }
    if (!cleanup.available) {
      throw new AdviserError(
        'upgrade-cleanup-blocked',
        cleanup.reason ?? 'The upgrade branch cannot be removed yet.',
      )
    }
    const { branch } = cleanup
    let localDeleted = false
    if (await localBranchExists(targetRoot, branch)) {
      try {
        // `git branch -d` itself refuses to delete an unmerged branch.
        await execFileAsync('git', ['branch', '-d', branch], { cwd: targetRoot })
      } catch (cause) {
        throw new AdviserError(
          'upgrade-cleanup-blocked',
          `Could not remove ${branch}: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
      localDeleted = true
    }
    let remoteDeleted = false
    if (await remoteBranchExists(targetRoot, branch)) {
      await execFileAsync(
        'git',
        ['push', 'origin', '--delete', branch],
        { cwd: targetRoot },
      )
      remoteDeleted = true
    }
    return {
      status: 'cleaned',
      branch,
      localDeleted,
      remoteDeleted,
      committed: false,
      pushed: false,
    }
  }

  /**
   * Merges a published upgrade branch back into the configured environment
   * branch and pushes it, completing the upgrade journey's merge step. The
   * destination is the deepest environment branch the upgrade branch descends
   * from (the working branch for long-lived repos), falling back to the
   * production branch for simple models. Safe by construction: the merge is
   * fast-forward only, so it refuses when the branches have diverged and can
   * never create a conflict. Requires a clean working tree; switching branches
   * is performed by the actioner, not left to the user.
   */
  async mergeUpgradeBranch(
    targetRoot: string,
    targetObservation: UpgradeTargetObservation,
  ): Promise<TctbpMergeResult> {
    const recordedRevision = targetObservation.tctbp.scaffold.sourceRevision
    const recordedVersion = targetObservation.tctbp.scaffold.sourceVersion
    if (!recordedRevision && !recordedVersion) {
      throw new AdviserError(
        'upgrade-merge-unavailable',
        'There is no upgrade branch to merge.',
      )
    }
    const branch = upgradeBranchName(recordedRevision, recordedVersion)
    if (!(await localBranchExists(targetRoot, branch))) {
      throw new AdviserError(
        'upgrade-merge-unavailable',
        'There is no upgrade branch to merge.',
      )
    }
    if (!targetObservation.workingTree.clean) {
      throw new AdviserError(
        'upgrade-merge-blocked',
        'The working tree must be clean before merging the upgrade branch.',
      )
    }
    const destination = await determineMergeDestination(
      targetRoot,
      targetObservation,
      branch,
    )
    if (!destination) {
      throw new AdviserError(
        'upgrade-merge-blocked',
        'No configured environment branch could be determined to merge into.',
      )
    }
    await execFileAsync('git', ['switch', destination], { cwd: targetRoot })
    try {
      await execFileAsync('git', ['merge', '--ff-only', branch], { cwd: targetRoot })
    } catch (cause) {
      throw new AdviserError(
        'upgrade-merge-blocked',
        `Could not fast-forward ${branch} into ${destination}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      )
    }
    await execFileAsync('git', ['push', 'origin', destination], { cwd: targetRoot })
    return {
      status: 'merged',
      branch,
      destinationBranch: destination,
      merged: true,
      pushed: true,
      committed: false,
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

const UPGRADE_BRANCH_PREFIX = 'upgrade/tctbp-'

/**
 * Deterministic, self-describing upgrade-branch name derived from the
 * canonical version and revision (e.g. `upgrade/tctbp-0.3.6-78b75fc`), so a
 * leftover branch is immediately recognizable as a TCTBP upgrade to that
 * version. Idempotent across retries and reusable across machines.
 */
function upgradeBranchName(
  sourceRevision: string | null,
  sourceVersion: string | null,
): string {
  const revision = sourceRevision?.slice(0, 7) ?? null
  const version = sourceVersion?.trim() || null
  if (version && revision) return `${UPGRADE_BRANCH_PREFIX}${version}-${revision}`
  if (version) return `${UPGRADE_BRANCH_PREFIX}${version}`
  if (revision) return `${UPGRADE_BRANCH_PREFIX}${revision}`
  return `${UPGRADE_BRANCH_PREFIX}source`
}

/**
 * Determines whether a leftover upgrade branch exists and can be removed
 * safely. Only the branch that corresponds to the target's *recorded* source
 * version+revision (i.e. the branch a previous apply actually created) is
 * considered. Removal is offered only after everything is verified: the
 * branch is fully merged into the current branch (nothing is lost), the
 * working tree is clean, and it is not the checked-out branch.
 */
async function computeUpgradeCleanup(
  targetRoot: string,
  observation: UpgradeTargetObservation,
): Promise<TctbpUpgradeCleanup | null> {
  const recordedRevision = observation.tctbp.scaffold.sourceRevision
  const recordedVersion = observation.tctbp.scaffold.sourceVersion
  if (!recordedRevision && !recordedVersion) return null
  const branch = upgradeBranchName(recordedRevision, recordedVersion)
  if (!(await localBranchExists(targetRoot, branch))) return null
  const currentBranch = observation.head.branch
  if (currentBranch === branch) {
    return {
      branch,
      available: false,
      reason: `You are currently on ${branch}; switch back to the environment branch before removing it.`,
    }
  }
  if (!observation.workingTree.clean) {
    return {
      branch,
      available: false,
      reason: 'The working tree is not clean; checkpoint or commit before cleaning up.',
    }
  }
  if (!(await branchIsAncestorOfHead(targetRoot, branch))) {
    return {
      branch,
      available: false,
      reason: `${branch} has not been merged back into ${currentBranch ?? 'the current branch'} yet — merge and push it first, then it can be removed safely.`,
    }
  }
  return { branch, available: true, reason: null }
}

async function branchIsAncestorOfHead(targetRoot: string, branch: string): Promise<boolean> {
  try {
    await execFileAsync(
      'git',
      ['merge-base', '--is-ancestor', branch, 'HEAD'],
      { cwd: targetRoot },
    )
    return true
  } catch {
    return false
  }
}

/**
 * Determines the branch a leftover upgrade branch should be merged back into:
 * the deepest configured environment branch (working → review → production)
 * that the upgrade branch descends from — i.e. the branch it was created from.
 * Falls back to the working branch (long-lived) or the production branch
 * (simple model) when no environment branch is an ancestor.
 */
async function determineMergeDestination(
  targetRoot: string,
  observation: UpgradeTargetObservation,
  upgradeBranch: string,
): Promise<string | null> {
  const model = observation.tctbp.branchModel
  const candidates = [
    model.workingBranch,
    model.preProductionBranch,
    model.productionBranch,
  ].filter((branch): branch is string => typeof branch === 'string' && branch.length > 0)
  for (const candidate of candidates) {
    if (await branchIsAncestorOf(targetRoot, candidate, upgradeBranch)) {
      return candidate
    }
  }
  return model.workingBranch ?? model.productionBranch ?? null
}

async function branchIsAncestorOf(
  targetRoot: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      'git',
      ['merge-base', '--is-ancestor', ancestor, descendant],
      { cwd: targetRoot },
    )
    return true
  } catch {
    return false
  }
}

async function remoteBranchExists(targetRoot: string, branch: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`],
      { cwd: targetRoot },
    )
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Moves the working tree onto the dedicated upgrade branch before the apply
 * writes managed files. Creates the branch from the current HEAD, or reuses an
 * existing one left behind by a previous attempt (the apply is idempotent over
 * managed files, so re-applying the same plan on it is safe). Requires an
 * attached branch and a clean working tree — the same guards the plan exposes
 * as safety blockers — so uncommitted work is never carried onto the branch.
 */
async function prepareUpgradeBranch(
  targetRoot: string,
  observation: UpgradeTargetObservation,
  sourceRevision: string | null,
  sourceVersion: string | null,
): Promise<{ branch: string; created: boolean }> {
  if (observation.head.detached || !observation.head.branch) {
    throw new AdviserError(
      'upgrade-no-branch',
      'The target repository has no active branch to apply from.',
    )
  }
  if (!observation.workingTree.clean) {
    throw new AdviserError(
      'upgrade-working-tree-dirty',
      'The working tree must be clean before creating a dedicated upgrade branch.',
    )
  }
  const branch = upgradeBranchName(sourceRevision, sourceVersion)
  if (await localBranchExists(targetRoot, branch)) {
    await execFileAsync('git', ['switch', branch], { cwd: targetRoot })
    return { branch, created: false }
  }
  await execFileAsync('git', ['switch', '-c', branch], { cwd: targetRoot })
  return { branch, created: true }
}

async function localBranchExists(targetRoot: string, branch: string): Promise<boolean> {
  try {
    await execFileAsync(
      'git',
      ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
      { cwd: targetRoot },
    )
    return true
  } catch {
    return false
  }
}

interface ApplyStepSelection {
  filesToApply: Array<{ path: string; action: ManagedFileAction }>
  policyApproved: boolean
  deletionPaths: string[]
}

/**
 * Validates one apply step against the reviewed plan and selects the files
 * it will touch. All steps in an ordered request are validated before any
 * file is written, so a multi-step apply is atomic with respect to the plan.
 */
function selectApplyStep(
  step: TctbpApplyStep,
  plan: TctbpUpgradePlan,
  managedChanges: Array<{ path: string; action: ManagedFileAction }>,
  obsoleteTargets: Array<{ path: string }>,
): ApplyStepSelection {
  const approvedPaths = new Set(step.approvedPaths)
  const policyApproved = (
    step.mode === 'approved-managed-files'
    && approvedPaths.has('.github/TCTBP.json')
    && plan.policy.state === 'drifted'
  )
  if (step.mode === 'approved-managed-files') {
    const unmanaged = step.approvedPaths.filter((filePath) => (
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
  const deletionPaths = Array.from(new Set(step.approvedDeletionPaths))
  if (deletionPaths.length > 0) {
    if (!step.confirmDeletions) {
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
    step.mode === 'additions-only'
      ? file.action === 'add'
      : approvedPaths.has(file.path)
  ))
  return { filesToApply, policyApproved, deletionPaths }
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
  cleanup: TctbpUpgradeCleanup | null,
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
    ...(cleanup?.branch ? { cleanup } : {}),
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
