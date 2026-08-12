import type {
  TctbpPolicyComparison,
  TctbpPolicyDifference,
} from '../shared/tctbp-upgrade'

const HARDENING_AREAS = [
  'candidateGuard',
  'promotionSafety',
  'releaseState',
  'runtimeTransaction',
  'codeLossPrevention',
] as const

const CANONICAL_POLICY_KEYS = [
  'schemaVersion',
  'adviserContract',
  'adviserVocabulary',
  ...HARDENING_AREAS,
  'tagging',
] as const

const TEMPLATE_IDENTITY_KEYS = [
  'templateMode',
  'templateType',
  'templateInstructions',
] as const

type JsonObject = Record<string, unknown>
type HardeningArea = typeof HARDENING_AREAS[number]

export interface TctbpPolicySnapshot {
  schemaVersion: number | null
  contractMajor: number | null
  contractMinor: number | null
  capabilities: string[]
  workflows: string[]
  hardening: Record<HardeningArea, boolean | null>
}

export function parseTctbpPolicy(content: string | null): TctbpPolicySnapshot | null {
  if (content === null) return null

  try {
    const value: unknown = JSON.parse(content)
    const profile = objectValue(value)
    if (!profile) return null
    const contract = objectValue(profile.adviserContract)
    const vocabulary = objectValue(profile.adviserVocabulary)
    return {
      schemaVersion: integerValue(profile.schemaVersion),
      contractMajor: integerValue(contract?.major),
      contractMinor: integerValue(contract?.minor),
      capabilities: stringArray(contract?.capabilities),
      workflows: stringArray(vocabulary?.workflowIds),
      hardening: Object.fromEntries(HARDENING_AREAS.map((area) => (
        [area, enabledValue(profile[area])]
      ))) as Record<HardeningArea, boolean | null>,
    }
  } catch {
    return null
  }
}

/**
 * Merges governance from the canonical policy with the target's own template
 * identity. The canonical governance describes the TCTBP-Web template repo
 * itself (templateMode: true); downstream projects must keep their own
 * templateMode / templateType / templateInstructions (or default to a
 * non-template profile, exactly like bootstrap sets templateMode: false).
 */
function mergeGovernance(
  sourceGovernance: JsonObject | null | undefined,
  targetGovernance: JsonObject | null | undefined,
): JsonObject | null | undefined {
  if (!sourceGovernance) {
    return targetGovernance ? clone(targetGovernance) as JsonObject : undefined
  }
  const identity: JsonObject = targetGovernance
    ? Object.fromEntries(
        TEMPLATE_IDENTITY_KEYS
          .filter((key) => key in targetGovernance)
          .map((key) => [key, targetGovernance[key]]),
      )
    : { templateMode: false }
  return { ...(clone(sourceGovernance) as JsonObject), ...identity }
}

const SCAFFOLD_TRIGGERS = new Set([
  'scaffold',
  'scaffold please',
  'scaffold web',
  'scaffold web please',
  'new project',
  'create project',
])

/**
 * Deterministically merge the activation surface (reconcile gap #2): union
 * the canonical triggers with the target's own triggers, then drop triggers
 * that are inapplicable to the target:
 *   - scaffold family (factory-only, never installed downstream);
 *   - promote family when the target disables promotion (simple strategy or
 *     promoteEnabled: false);
 *   - deploy <environment> variants when the target maps no such deploy target;
 *   - bare deploy / deploy please when the target configures no deploy section.
 * The target's branchCommand configuration is preserved when present.
 */
function mergeActivation(
  source: JsonObject | null | undefined,
  target: JsonObject | null | undefined,
  targetProfile: JsonObject,
): JsonObject | null | undefined {
  if (!source) {
    return target ?? undefined
  }

  const sourceTriggers = stringArray(source.triggers)
  const targetTriggers = target ? stringArray(target.triggers) : []
  const promotionEnabled = promotionEnabledFor(targetProfile)
  const reviewEnabled = reviewEnabledFor(targetProfile)
  const deploy = objectValue(targetProfile.deploy)
  const deployTargetKeysSet = deployTargetKeys(targetProfile)
  const deployConfigured =
    deployTargetKeysSet.size > 0
    || stringArray(deploy?.preferredTriggers).length > 0

  const mergedTriggers: string[] = []
  const seen = new Set<string>()
  // Canonical additions first, filtered for applicability to the target.
  for (const trigger of sourceTriggers) {
    const key = trigger.toLowerCase()
    if (seen.has(key)) continue
    if (!activationTriggerApplicable(key, {
      promotionEnabled,
      reviewEnabled,
      deployConfigured,
      deployTargetKeysSet,
    })) {
      continue
    }
    seen.add(key)
    mergedTriggers.push(trigger)
  }
  // Pre-existing target triggers are project-owned: preserve them regardless
  // of the canonical applicability filters (discovered via the kindling
  // reconcile, where pre-existing deploy variants were being stripped).
  for (const trigger of targetTriggers) {
    const key = trigger.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    mergedTriggers.push(trigger)
  }

  return {
    triggers: mergedTriggers,
    caseInsensitive:
      typeof source.caseInsensitive === 'boolean' ? source.caseInsensitive
        : typeof target?.caseInsensitive === 'boolean' ? target.caseInsensitive
        : true,
    ...(target?.branchCommand
      ? { branchCommand: clone(target.branchCommand) }
      : source.branchCommand
        ? { branchCommand: clone(source.branchCommand) }
        : {}),
  }
}

function promotionEnabledFor(target: JsonObject): boolean {
  const branchModel = objectValue(target.branchModel)
  if (branchModel?.strategy === 'simple') return false
  if (branchModel?.promoteEnabled === false) return false
  return true
}

function reviewEnabledFor(target: JsonObject): boolean {
  const branchModel = objectValue(target.branchModel)
  if (branchModel?.strategy === 'long-lived-environment-branches') return true
  if (typeof branchModel?.reviewBranch === 'string' && branchModel.reviewBranch.length > 0) return true
  return branchModel?.preProductionBranch === 'review'
}

function deployTargetKeys(target: JsonObject): Set<string> {
  const deploy = objectValue(target.deploy)
  const targets = deploy ? (objectValue(deploy.targets) ?? {}) : {}
  const keys = new Set<string>(Object.keys(targets))
  for (const definition of Object.values(targets)) {
    const def = objectValue(definition)
    for (const alias of stringArray(def?.aliases)) keys.add(alias)
  }
  return keys
}

interface ActivationFilterContext {
  promotionEnabled: boolean
  reviewEnabled: boolean
  deployConfigured: boolean
  deployTargetKeysSet: Set<string>
}

function activationTriggerApplicable(
  key: string,
  context: ActivationFilterContext,
): boolean {
  if (SCAFFOLD_TRIGGERS.has(key)) return false
  if (key === 'promote review' || key === 'promote review please') {
    return context.promotionEnabled && context.reviewEnabled
  }
  if (key === 'promote' || key.startsWith('promote ')) return context.promotionEnabled
  if (key === 'deploy' || key === 'deploy please') return context.deployConfigured
  const variant = /^deploy (dev|development|staging|review|prod|production)( please)?$/.exec(key)
  if (variant) {
    const env = variant[1]
    const envKey = env === 'dev' || env === 'development' ? 'dev'
      : env === 'staging' ? 'staging'
      : env === 'review' ? 'review'
      : 'production'
    return context.deployTargetKeysSet.has(envKey)
  }
  return true
}

/**
 * Migration rule (reconcile gap #3): `prepare release` belongs to the release
 * orchestrator, not to ship. The canonical semantic changed; a stale target
 * profile must not keep shipping the phrase under ship's ownership.
 */
function migratePrepareReleaseOwnership(merged: JsonObject): void {
  const ship = objectValue(merged.ship)
  if (ship && Array.isArray(ship.preferredTriggers)) {
    const triggers = ship.preferredTriggers as unknown[]
    const cleaned = triggers.filter(
      (trigger) => trigger !== 'prepare release' && trigger !== 'prepare release please',
    )
    if (cleaned.length !== triggers.length) {
      ship.preferredTriggers = cleaned
    }
  }
  const release = objectValue(merged.release)
  if (release && Array.isArray(release.preferredTriggers)) {
    const triggers = release.preferredTriggers as unknown[]
    if (!triggers.includes('prepare release')) triggers.push('prepare release')
    if (!triggers.includes('prepare release please')) triggers.push('prepare release please')
  }
}

export function mergeCanonicalTctbpPolicy(
  sourceContent: string | null,
  targetContent: string | null,
): string | null {
  if (!sourceContent || !targetContent) return null
  let source: JsonObject | null
  let target: JsonObject | null
  try {
    source = objectValue(JSON.parse(sourceContent))
    target = objectValue(JSON.parse(targetContent))
  } catch {
    return null
  }
  if (!source || !target) return null

  const merged: JsonObject = { ...target }
  for (const key of CANONICAL_POLICY_KEYS) {
    if (key in source) merged[key] = clone(source[key])
  }

  // Activation: canonical trigger surface unioned with the target's own
  // triggers, filtered deterministically for strategy and deploy config.
  const mergedActivation = mergeActivation(
    objectValue(source.activation),
    objectValue(target.activation),
    target,
  )
  if (mergedActivation !== undefined) {
    merged.activation = mergedActivation
  }

  // Migration rule: `prepare release` belongs to release, not ship.
  migratePrepareReleaseOwnership(merged)

  // Governance carries the canonical source-of-truth declarations, but the
  // template identity belongs to the target project. Preserve the target's
  // templateMode / templateType / templateInstructions (default: non-template).
  if ('governance' in source) {
    merged.governance = mergeGovernance(
      objectValue(source.governance),
      objectValue(target.governance),
    )
  }
  const sourceProfile = objectValue(source.profile)
  const targetProfile = objectValue(target.profile)
  if (sourceProfile?.developmentPolicy) {
    merged.profile = {
      ...(targetProfile ?? {}),
      developmentPolicy: clone(sourceProfile.developmentPolicy),
    }
  }
  return `${JSON.stringify(merged, null, 2)}\n`
}

export function compareTctbpPolicy(
  source: TctbpPolicySnapshot | null,
  target: TctbpPolicySnapshot | null,
): TctbpPolicyComparison {
  if (!source || !target) {
    return {
      state: 'unavailable',
      differences: [{
        area: 'policy',
        message: 'Canonical or target TCTBP policy could not be inspected.',
      }],
    }
  }

  const differences: TctbpPolicyDifference[] = []
  compareScalar(differences, 'schema', 'schema version', source.schemaVersion, target.schemaVersion)
  compareScalar(differences, 'contract', 'contract major version', source.contractMajor, target.contractMajor)
  compareScalar(differences, 'contract', 'contract minor version', source.contractMinor, target.contractMinor)
  addMissing(differences, 'capabilities', 'capability', source.capabilities, target.capabilities)
  addMissing(differences, 'workflows', 'workflow', source.workflows, target.workflows)

  for (const area of HARDENING_AREAS) {
    if (source.hardening[area] === true && target.hardening[area] !== true) {
      differences.push({
        area: 'hardening',
        message: `${area} is enabled canonically but not enabled in the target policy.`,
      })
    }
  }

  return {
    state: differences.length === 0 ? 'aligned' : 'drifted',
    differences,
  }
}

function compareScalar(
  differences: TctbpPolicyDifference[],
  area: TctbpPolicyDifference['area'],
  label: string,
  source: number | null,
  target: number | null,
): void {
  if (source === target) return
  differences.push({
    area,
    message: `Canonical ${label} is ${source ?? 'unavailable'}; target is ${target ?? 'unavailable'}.`,
  })
}

function addMissing(
  differences: TctbpPolicyDifference[],
  area: TctbpPolicyDifference['area'],
  label: string,
  source: string[],
  target: string[],
): void {
  const missing = source.filter((value) => !target.includes(value))
  if (missing.length === 0) return
  differences.push({
    area,
    message: `Target is missing canonical ${label}(s): ${missing.join(', ')}.`,
  })
}

function clone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

function objectValue(value: unknown): JsonObject | null {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  ) ? value as JsonObject : null
}

function integerValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    )))
    : []
}

function enabledValue(value: unknown): boolean | null {
  const object = objectValue(value)
  return typeof object?.enabled === 'boolean' ? object.enabled : null
}
