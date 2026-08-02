import type { AiReviewResult, UpgradeReviewEvidence } from '../shared/ai-review'
import type { RepositoryObservation } from '../shared/inspection'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'

const MAX_FILES = 100

export function buildUpgradeReviewEvidence(
  repositoryName: string,
  observation: RepositoryObservation,
  plan: TctbpUpgradePlan,
): UpgradeReviewEvidence {
  const files = plan.drift.files.filter((file) => file.action !== 'preserve')
  return {
    evidenceVersion: 1,
    repositoryName: repositoryName.slice(0, 200),
    planFingerprint: plan.fingerprint ?? null,
    disposition: plan.disposition,
    sourceAlignment: plan.sourceAlignment,
    source: {
      repository: plan.source.repository,
      version: plan.source.version,
      revision: plan.source.revision,
    },
    target: {
      branch: observation.head.branch,
      headSha: observation.head.sha,
      sourceRepository: plan.target.sourceRepository,
      sourceVersion: plan.target.sourceVersion,
    },
    actionCounts: plan.actionCounts,
    files: files.slice(0, MAX_FILES).map((file) => ({
      ...file,
      path: file.path.slice(0, 300),
    })),
    blockers: plan.blockers.map((blocker) => ({
      code: blocker.code,
      message: blocker.message.slice(0, 500),
    })),
    policyDifferences: plan.policy.differences.map((difference) => ({
      area: difference.area,
      message: difference.message.slice(0, 500),
    })),
    truncated: files.length > MAX_FILES,
  }
}

export function aiReviewDisplayStatus(result: AiReviewResult): string {
  if (result.status === 'available') return 'AI review available'
  if (result.status === 'disabled') return 'AI review not configured'
  if (result.status === 'invalid') return 'AI review response invalid'
  return 'AI review unavailable'
}
