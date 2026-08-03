import { createHash } from 'node:crypto'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'

export function fingerprintTctbpPlan(
  plan: Omit<TctbpUpgradePlan, 'fingerprint'>,
): string {
  const basis = {
    sourceRevision: plan.source.revision,
    target: plan.target,
    drift: {
      files: plan.drift.files.map((file) => ({
        path: file.path,
        state: file.state,
        sourceHash: file.sourceHash,
        targetHash: file.targetHash,
      })),
      obsoleteTargets: plan.drift.obsoleteTargets ?? [],
    },
    policy: plan.policy,
  }
  return createHash('sha256')
    .update(JSON.stringify(basis))
    .digest('hex')
}
