export const GITHUB_OBSERVATION_BASIS = 'github-rest-api' as const

export type GitHubSectionStatus = 'available' | 'unavailable'

export interface GitHubSection<T> {
  status: GitHubSectionStatus
  items: T[]
  totalCount: number | null
  truncated: boolean
  error: GitHubProviderIssue | null
}

export interface GitHubProviderIssue {
  code: string
  message: string
}

export interface GitHubRepositoryIdentity {
  fullName: string
  owner: string
  name: string
}

export interface GitHubBranch {
  name: string
  sha: string
  protected: boolean
}

export interface GitHubTag {
  name: string
  sha: string
}

export interface GitHubRelease {
  name: string
  tagName: string
  publishedAt: string | null
  draft: boolean
  prerelease: boolean
}

export interface GitHubWorkflowRun {
  name: string
  branch: string | null
  sha: string
  status: string
  conclusion: string | null
  updatedAt: string
}

export interface GitHubCheckRun {
  name: string
  sha: string
  status: string
  conclusion: string | null
  completedAt: string | null
}

export interface GitHubPullRequest {
  number: number
  title: string
  draft: boolean
  updatedAt: string
}

export interface GitHubIssue {
  number: number
  title: string
  updatedAt: string
}

export interface GitHubRepositoryObservation {
  status: 'available'
  basis: typeof GITHUB_OBSERVATION_BASIS
  retrievedAt: string
  repository: {
    fullName: string
    ownerAvatarUrl: string | null
    htmlUrl: string
    defaultBranch: string
    defaultBranchSha: string | null
    visibility: 'public' | 'private' | 'internal'
    archived: boolean
    pushedAt: string | null
  }
  branches: GitHubSection<GitHubBranch>
  tags: GitHubSection<GitHubTag>
  releases: GitHubSection<GitHubRelease>
  workflows: GitHubSection<GitHubWorkflowRun>
  checks: GitHubSection<GitHubCheckRun>
  pullRequests: GitHubSection<GitHubPullRequest>
  issues: GitHubSection<GitHubIssue>
}

export interface GitHubUnavailableObservation {
  status: 'unavailable'
  basis: typeof GITHUB_OBSERVATION_BASIS
  retrievedAt: string
  repository: {
    fullName: string
  }
  error: GitHubProviderIssue
}

export type GitHubObservation =
  | GitHubRepositoryObservation
  | GitHubUnavailableObservation

export interface GitHubDisabledObservation {
  status: 'disabled' | 'not-mapped'
  basis: typeof GITHUB_OBSERVATION_BASIS
  retrievedAt: null
}

export type RepositoryGitHubEvidence =
  | GitHubObservation
  | GitHubDisabledObservation
