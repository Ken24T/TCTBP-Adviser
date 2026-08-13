import type { GithubAccessStatus } from '../shared/app-settings'
import type { GitHubConfig } from './config'
import { errorCode } from './errors'
import { GitHubRestClient } from './github-client'

/**
 * Reports the configured GitHub access: whether a token is present, whether it
 * authenticates, which account it belongs to, and whether it can create
 * repositories. The token itself is never exposed — only this status is.
 */
export class GitHubAccessService {
  constructor(
    readonly config: GitHubConfig,
    readonly client: GitHubRestClient,
  ) {}

  async status(): Promise<GithubAccessStatus> {
    if (!this.config.token) {
      return {
        configured: false,
        authenticated: false,
        account: null,
        scopes: [],
        canCreateRepositories: false,
        message: 'No GitHub token is configured.',
      }
    }
    try {
      const { user, scopes } = await this.client.readUser()
      const canCreateRepositories = scopes.includes('repo')
        ? true
        : scopes.length === 0
          ? null
          : false
      return {
        configured: true,
        authenticated: true,
        account: user.login ? { login: user.login, name: user.name } : null,
        scopes,
        canCreateRepositories,
        message: null,
      }
    } catch (error) {
      return {
        configured: true,
        authenticated: false,
        account: null,
        scopes: [],
        canCreateRepositories: false,
        message: error instanceof Error ? error.message : errorCode(error),
      }
    }
  }
}
