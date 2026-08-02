import { createHash } from 'node:crypto'
import { AdviserError } from './errors'
import type { CanonicalSourceSummary } from '../shared/tctbp-upgrade'
import type {
  TctbpBootstrapBranchStrategy,
  TctbpBootstrapPlan,
  TctbpBootstrapRequest,
} from '../shared/tctbp-bootstrap'

export function validateBootstrapRequest(
  input: unknown,
): TctbpBootstrapRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw invalidRequest()
  }
  const value = input as Record<string, unknown>
  const projectName = stringValue(value.projectName)
  const projectDescription = stringValue(value.projectDescription)
  const workingBranch = stringValue(value.workingBranch)
  const productionBranch = stringValue(value.productionBranch)
  const branchStrategy = value.branchStrategy
  const preProductionBranch = value.preProductionBranch === null
    ? null
    : stringValue(value.preProductionBranch)
  const testCommand = value.testCommand === null
    ? null
    : stringValue(value.testCommand)
  const buildCommand = value.buildCommand === null
    ? null
    : stringValue(value.buildCommand)

  if (
    !projectName
    || !projectDescription
    || !workingBranch
    || !productionBranch
    || !isBranchStrategy(branchStrategy)
    || (branchStrategy !== 'simple' && !preProductionBranch)
    || (branchStrategy === 'simple' && preProductionBranch !== null)
    || (testCommand === undefined || buildCommand === undefined)
    || typeof value.deployEnabled !== 'boolean'
    || typeof value.includeHookLayer !== 'boolean'
  ) throw invalidRequest()

  return {
    projectName,
    projectDescription,
    branchStrategy,
    workingBranch,
    preProductionBranch: preProductionBranch ?? null,
    productionBranch,
    testCommand,
    buildCommand,
    deployEnabled: value.deployEnabled,
    includeHookLayer: value.includeHookLayer,
  }
}

export function generateBootstrapPolicy(
  sourceContent: string | null,
  request: TctbpBootstrapRequest,
): string | null {
  if (!sourceContent) return null
  try {
    const source = JSON.parse(sourceContent) as Record<string, any>
    const profile = source.profile && typeof source.profile === 'object'
      ? source.profile
      : {}
    const commands = profile.commands && typeof profile.commands === 'object'
      ? profile.commands
      : {}
    const qualityGates = profile.qualityGates && typeof profile.qualityGates === 'object'
      ? profile.qualityGates
      : {}
    const branchModel = request.branchStrategy === 'simple'
      ? {
        strategy: 'simple',
        productionBranch: request.productionBranch,
        promoteEnabled: false,
        deployEnabled: false,
      }
      : request.branchStrategy === 'staged'
        ? {
          strategy: 'staged',
          workingBranch: request.workingBranch,
          stagingBranch: request.preProductionBranch,
          productionBranch: request.productionBranch,
          promoteEnabled: true,
          deployEnabled: request.deployEnabled,
        }
        : {
          strategy: 'long-lived-environment-branches',
          workingBranch: request.workingBranch,
          reviewBranch: request.preProductionBranch,
          productionBranch: request.productionBranch,
          promoteEnabled: true,
          deployEnabled: request.deployEnabled,
        }
    return `${JSON.stringify({
      ...source,
      governance: { ...source.governance, templateMode: false },
      project: {
        ...source.project,
        name: request.projectName,
        description: request.projectDescription,
        defaultBranch: request.productionBranch,
      },
      branchModel,
      profile: {
        ...profile,
        commands: {
          ...commands,
          test: request.testCommand,
          build: request.buildCommand,
        },
        qualityGates: {
          ...qualityGates,
          requireTestsBeforeShip: request.testCommand !== null,
          requireBuildBeforeShip: request.buildCommand !== null,
        },
      },
    }, null, 2)}\n`
  } catch {
    return null
  }
}

export function buildBootstrapPlan(
  source: CanonicalSourceSummary,
  target: {
    branch: string | null
    clean: boolean
    detached: boolean
    operationCount: number
  },
  request: TctbpBootstrapRequest,
): TctbpBootstrapPlan {
  const plan = {
    sourceRevision: source.revision,
    sourceVersion: source.version,
    managedFileCount: source.managedFileCount,
    recommendedBranch: source.revision
      ? `upgrade/tctbp-bootstrap-${source.revision.slice(0, 7)}`
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
    request,
    targetBranch: target.branch,
    targetClean: target.clean,
    targetDetached: target.detached,
    activeOperationCount: target.operationCount,
    applyAllowed: false as const,
  }
  return {
    ...plan,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(plan))
      .digest('hex'),
  }
}

function stringValue(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function isBranchStrategy(value: unknown): value is TctbpBootstrapBranchStrategy {
  return value === 'simple'
    || value === 'staged'
    || value === 'long-lived-environment-branches'
}

function invalidRequest(): AdviserError {
  return new AdviserError(
    'bootstrap-request-invalid',
    'Bootstrap configuration is incomplete or invalid.',
  )
}
