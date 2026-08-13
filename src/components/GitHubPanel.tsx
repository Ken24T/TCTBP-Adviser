import type {
  GitHubRepositoryObservation,
  RepositoryGitHubEvidence,
} from '../../shared/github'
import { formatAge } from '../presentation'
import { Badge } from './primitives'
import { CollapsiblePanel } from './CollapsiblePanel'

export function GitHubPanel({
  evidence,
  localBranch,
  localSha,
  defaultOpen = false,
}: {
  evidence: RepositoryGitHubEvidence
  localBranch?: string | null
  localSha?: string | null
  defaultOpen?: boolean
}) {
  // No evidence to show: the "GitHub enrichment disabled / not mapped /
  // unavailable" one-liners are supporting detail, and hiding them entirely
  // keeps the page minimal. The absence itself is implied by the layout.
  if (evidence.status !== 'available') return null

  const repository = evidence.repository
  return (
    <CollapsiblePanel
      eyebrow="Separate provider evidence"
      title="GitHub-visible state"
      defaultOpen={defaultOpen}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-2 justify-between mb-4">
        <div>
          <p className="text-sm">
            <a
              className="font-medium text-teal-700 hover:text-teal-800 hover:underline"
              href={repository.htmlUrl}
              rel="noreferrer"
              target="_blank"
            >
              {repository.fullName}
            </a>
            {' · '}{repository.visibility}
            {repository.archived ? ' · archived' : ''}
          </p>
        </div>
        <Badge tone="neutral">{providerAge(evidence.retrievedAt)}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <ProviderFact
          label="Default branch"
          value={branchSummary(evidence)}
        />
        <ProviderFact
          label="Local branch on GitHub"
          value={localBranchSummary(evidence, localBranch, localSha)}
        />
        <ProviderFact
          label="Checks"
          value={checkSummary(evidence)}
        />
        <ProviderFact
          label="Workflows"
          value={workflowSummary(evidence)}
        />
        <ProviderFact
          label="Open pull requests"
          value={pullRequestSummary(evidence)}
        />
        <ProviderFact
          label="Open issues"
          value={issueSummary(evidence)}
        />
        <ProviderFact
          label="Tags"
          value={tagSummary(evidence)}
        />
        <ProviderFact
          label="Releases"
          value={releaseSummary(evidence)}
        />
      </div>

      <ProviderProblems evidence={evidence} />
      <p className="mt-4 text-xs text-text-faint">
        GitHub observations do not replace working-tree or local tracking-ref
        evidence and do not alter the deterministic recommendation.
      </p>
    </CollapsiblePanel>
  )
}

function ProviderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-surface-soft rounded-lg">
      <span className="block text-xs text-text-muted">{label}</span>
      <strong className="block mt-0.5 text-sm text-text-primary break-all">{value}</strong>
    </div>
  )
}

function ProviderProblems({
  evidence,
}: {
  evidence: GitHubRepositoryObservation
}) {
  const unavailable = [
    { name: 'branches', unavailable: evidence.branches.status === 'unavailable' },
    { name: 'tags', unavailable: evidence.tags.status === 'unavailable' },
    { name: 'releases', unavailable: evidence.releases.status === 'unavailable' },
    { name: 'workflows', unavailable: evidence.workflows.status === 'unavailable' },
    { name: 'checks', unavailable: evidence.checks.status === 'unavailable' },
    {
      name: 'pull requests',
      unavailable: evidence.pullRequests.status === 'unavailable',
    },
    { name: 'issues', unavailable: evidence.issues.status === 'unavailable' },
  ].filter((section) => section.unavailable)
  if (unavailable.length === 0) return null
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
      Partial provider evidence: {unavailable.map(({ name }) => name).join(', ')}
      {' '}could not be retrieved.
    </div>
  )
}

function branchSummary(evidence: GitHubRepositoryObservation): string {
  const sha = evidence.repository.defaultBranchSha
  return `${evidence.repository.defaultBranch}${sha ? ` · ${sha.slice(0, 7)}` : ''}`
}

function checkSummary(evidence: GitHubRepositoryObservation): string {
  const latest = evidence.checks.items[0]
  if (evidence.checks.status === 'unavailable') return 'Unavailable'
  if (!latest) return 'No recent checks'
  return `${latest.name} · ${latest.conclusion ?? latest.status}`
}

function localBranchSummary(
  evidence: GitHubRepositoryObservation,
  localBranch?: string | null,
  localSha?: string | null,
): string {
  if (!localBranch) return 'No local branch'
  if (evidence.branches.status === 'unavailable') return 'Unavailable'
  const remote = evidence.branches.items.find(
    (branch) => branch.name === localBranch,
  )
  if (!remote) return `${localBranch} · not visible`
  const relation = localSha === remote.sha ? 'same commit' : 'different commit'
  return `${localBranch} · ${remote.sha.slice(0, 7)} · ${relation}`
}

function workflowSummary(evidence: GitHubRepositoryObservation): string {
  const latest = evidence.workflows.items[0]
  if (evidence.workflows.status === 'unavailable') return 'Unavailable'
  if (!latest) return 'No recent runs'
  return `${latest.name} · ${latest.conclusion ?? latest.status}`
}

function pullRequestSummary(evidence: GitHubRepositoryObservation): string {
  if (evidence.pullRequests.status === 'unavailable') return 'Unavailable'
  const latest = evidence.pullRequests.items[0]
  return latest
    ? `${count(evidence.pullRequests)} · #${latest.number} ${latest.title}`
    : 'None'
}

function issueSummary(evidence: GitHubRepositoryObservation): string {
  if (evidence.issues.status === 'unavailable') return 'Unavailable'
  const latest = evidence.issues.items[0]
  return latest
    ? `${count(evidence.issues)} · #${latest.number} ${latest.title}`
    : 'None'
}

function tagSummary(evidence: GitHubRepositoryObservation): string {
  if (evidence.tags.status === 'unavailable') return 'Unavailable'
  const latest = evidence.tags.items[0]
  return latest
    ? `${evidence.tags.totalCount} · latest ${latest.name}`
    : 'None'
}

function releaseSummary(evidence: GitHubRepositoryObservation): string {
  if (evidence.releases.status === 'unavailable') return 'Unavailable'
  const latest = evidence.releases.items[0]
  return latest
    ? `${evidence.releases.totalCount} · latest ${latest.tagName}`
    : 'None'
}

function count(section: { status: string; totalCount: number | null }): string {
  if (section.status !== 'available') return 'unknown'
  return String(section.totalCount ?? 0)
}

function providerAge(retrievedAt: string): string {
  const age = Math.max(0, Date.now() - Date.parse(retrievedAt))
  return `Retrieved ${formatAge(age)}`
}
