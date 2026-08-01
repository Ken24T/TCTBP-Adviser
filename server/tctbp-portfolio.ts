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
  }
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
    sourceUnavailable: localPlans.filter(
      (repository) => repository.upgrade?.disposition === 'source-unavailable',
    ).length,
  }
}
