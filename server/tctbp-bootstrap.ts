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
  return {
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
    applyAllowed: false,
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
