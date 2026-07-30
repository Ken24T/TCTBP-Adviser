import type { GitHubRepositoryObservation } from '../shared/github'

export function githubObservationFixture(): GitHubRepositoryObservation {
  return {
    status: 'available',
    basis: 'github-rest-api',
    retrievedAt: '2026-07-30T06:00:00.000Z',
    repository: {
      fullName: 'Ken24T/TCTBP-Adviser',
      htmlUrl: 'https://github.com/Ken24T/TCTBP-Adviser',
      defaultBranch: 'development',
      defaultBranchSha: 'abcdef1234567890',
      visibility: 'public',
      archived: false,
      pushedAt: '2026-07-30T05:59:00.000Z',
    },
    branches: available([
      { name: 'development', sha: 'abcdef1234567890', protected: false },
      { name: 'main', sha: '9876543210abcdef', protected: false },
    ]),
    tags: available([{ name: 'v0.1.0', sha: 'tag-sha' }]),
    releases: available([{
      name: 'First release',
      tagName: 'v0.1.0',
      publishedAt: '2026-07-29T00:00:00.000Z',
      draft: false,
      prerelease: false,
    }]),
    workflows: available([{
      name: 'CI',
      branch: 'development',
      sha: 'abcdef1234567890',
      status: 'completed',
      conclusion: 'success',
      updatedAt: '2026-07-30T05:58:00.000Z',
    }]),
    checks: available([{
      name: 'test',
      sha: 'abcdef1234567890',
      status: 'completed',
      conclusion: 'success',
      completedAt: '2026-07-30T05:57:00.000Z',
    }]),
    pullRequests: available([{
      number: 9,
      title: 'Provider work',
      draft: false,
      updatedAt: '2026-07-30T05:56:00.000Z',
    }]),
    issues: available([{
      number: 12,
      title: 'Provider issue',
      updatedAt: '2026-07-30T05:55:00.000Z',
    }]),
  }
}

function available<T>(items: T[]) {
  return {
    status: 'available',
    items,
    totalCount: items.length,
    truncated: false,
    error: null,
  } as const
}
