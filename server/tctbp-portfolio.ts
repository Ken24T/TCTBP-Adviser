import type {
  PortfolioRepository,
  PortfolioUpgradeSummary,
  PortfolioUpgradeTotals,
} from '../shared/portfolio'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'

export function summarizeUpgradePlan(
  plan: TctbpUpgradePlan,
): PortfolioUpgradeSummary {
  return {
    disposition: plan.disposition,
    sourceAlignment: plan.sourceAlignment,
    actionCounts: plan.actionCounts,
    blockerCount: plan.blockers.length,
    policyDifferenceCount: plan.policy.differences.length,
    reasons: upgradeReasons(plan),
  }
}

function upgradeReasons(plan: TctbpUpgradePlan): string[] {
  const reasons: string[] = []
  if (plan.blockers.length > 0) reasons.push(`${plan.blockers.length} blocker(s)`)
  if (plan.sourceAlignment === 'outdated') reasons.push('canonical source is newer')
  if (plan.sourceAlignment === 'different-source') reasons.push('different source repository')
  if (plan.disposition === 'bootstrap-required') reasons.push('TCTBP infrastructure is not installed')
  if (plan.actionCounts.add > 0) reasons.push(`${plan.actionCounts.add} managed file(s) missing`)
  if (plan.actionCounts.review > 0) reasons.push(`${plan.actionCounts.review} managed file(s) drifted`)
  if (plan.policy.differences.length > 0) reasons.push(`${plan.policy.differences.length} policy difference(s)`)
  if (reasons.length === 0 && plan.disposition === 'current') reasons.push('aligned with canonical TCTBP-Web')
  if (reasons.length === 0) reasons.push('canonical source unavailable')
  return reasons
}

export function summarizePortfolioUpgrades(
  repositories: readonly PortfolioRepository[],
): PortfolioUpgradeTotals {
  const localPlans = repositories.filter(
    (repository) => repository.source === 'local' && repository.upgrade,
  )
  return {
    enabled: localPlans.length > 0,
    current: localPlans.filter(
      (repository) => repository.upgrade?.disposition === 'current',
    ).length,
    reviewRequired: localPlans.filter(
      (repository) => repository.upgrade?.disposition === 'review-required',
    ).length,
    bootstrapRequired: localPlans.filter(
      (repository) => repository.upgrade?.disposition === 'bootstrap-required',
    ).length,
    blocked: localPlans.filter(
      (repository) => (repository.upgrade?.blockerCount ?? 0) > 0,
    ).length,
    sourceUnavailable: localPlans.filter(
      (repository) => repository.upgrade?.disposition === 'source-unavailable',
    ).length,
  }
}
