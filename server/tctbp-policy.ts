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
  'governance',
  ...HARDENING_AREAS,
  'tagging',
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
