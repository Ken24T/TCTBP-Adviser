import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'

export interface TctbpPlanDocument {
  formatVersion: 1
  repository: string
  generatedAt: string
  plan: TctbpUpgradePlan
}

export function createTctbpPlanDocument(
  repository: string,
  plan: TctbpUpgradePlan,
  generatedAt = new Date().toISOString(),
): TctbpPlanDocument {
  return {
    formatVersion: 1,
    repository,
    generatedAt,
    plan,
  }
}

export function formatTctbpPlanJson(document: TctbpPlanDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`
}

export function formatTctbpPlanMarkdown(document: TctbpPlanDocument): string {
  const { plan } = document
  const driftFiles = plan.drift.files.filter((file) => file.action !== 'preserve')
  const obsoleteFiles = plan.drift.obsoleteTargets ?? []
  const lines = [
    `# TCTBP upgrade plan: ${document.repository}`,
    '',
    `Generated: ${document.generatedAt}`,
    `Disposition: ${plan.disposition}`,
    `Source alignment: ${plan.sourceAlignment}`,
    `Plan fingerprint: ${plan.fingerprint ?? 'unavailable'}`,
    `Target branch: ${plan.target.branch ?? 'unknown'}`,
    '',
    '## Canonical source',
    '',
    `- Repository: ${plan.source.repository ?? 'unavailable'}`,
    `- Version: ${plan.source.version ?? 'unknown'}`,
    `- Revision: ${plan.source.revision ?? 'unknown'}`,
    `- Managed files: ${plan.source.managedFileCount}`,
    '',
    '## Actions',
    '',
    `- Preserve: ${plan.actionCounts.preserve}`,
    `- Add: ${plan.actionCounts.add}`,
    `- Review: ${plan.actionCounts.review}`,
    `- Unavailable: ${plan.actionCounts.unavailable}`,
    '',
    '## Blockers',
    '',
    ...(plan.blockers.length > 0
      ? plan.blockers.map((blocker) => `- ${blocker.code}: ${blocker.message}`)
      : ['- None']),
    '',
    '## Managed file changes',
    '',
    ...(driftFiles.length > 0
      ? driftFiles.map((file) => (
        `- ${file.action}: \`${file.path}\` (source ${file.sourceHash ?? 'unavailable'}, target ${file.targetHash ?? 'missing'})`
      ))
      : ['- None']),
    '',
    '## Obsolete managed files',
    '',
    ...(obsoleteFiles.length > 0
      ? obsoleteFiles.map((file) => `- delete only with explicit confirmation: \`${file.path}\` (target ${file.targetHash})`)
      : ['- None']),
    '',
    '## Policy differences',
    '',
    ...(plan.policy.differences.length > 0
      ? plan.policy.differences.map((difference) => `- ${difference.area}: ${difference.message}`)
      : ['- None']),
    '',
    'This is a read-only plan. No repository changes were applied.',
    '',
  ]
  return lines.join('\n')
}
