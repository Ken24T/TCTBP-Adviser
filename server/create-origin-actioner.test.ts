import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createGitRepository,
  createTemporaryDirectory,
  git,
} from '../test/helpers'
import {
  CreateGithubOriginActioner,
  validateRepositoryName,
} from './create-origin-actioner'
import { AdviserError } from './errors'
import type { GitHubRestClient, GitHubUserIdentity } from './github-client'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

interface FakeClient {
  readUser: () => Promise<{ user: GitHubUserIdentity; scopes: string[] }>
  repositoryExists: (owner: string, name: string) => Promise<boolean>
  createRepository: (options: { name: string; private: boolean }) => Promise<void>
}

function fakeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    readUser: vi.fn(async () => ({
      user: { login: 'Ken24T', name: 'Ken' },
      scopes: ['repo'],
    })),
    repositoryExists: vi.fn(async () => false),
    createRepository: vi.fn(async () => undefined),
    ...overrides,
  }
}

function asClient(fake: FakeClient): GitHubRestClient {
  return fake as unknown as GitHubRestClient
}

describe('create-origin actioner', () => {
  it('creates a private repository and connects it as origin', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root, 'repository')
    const client = fakeClient()
    const steps: string[] = []

    const result = await new CreateGithubOriginActioner(asClient(client)).run(
      repository,
      { name: 'adviser-test-repo', visibility: 'private' },
      (step) => { steps.push(step) },
    )

    expect(result).toMatchObject({
      workflowId: 'create-origin',
      remote: 'https://github.com/Ken24T/adviser-test-repo.git',
      pushed: false,
      verifiedClean: true,
    })
    expect(client.repositoryExists)
      .toHaveBeenCalledWith('Ken24T', 'adviser-test-repo')
    expect(client.createRepository)
      .toHaveBeenCalledWith({ name: 'adviser-test-repo', private: true })
    expect(git(repository, ['remote', 'get-url', 'origin']))
      .toBe('https://github.com/Ken24T/adviser-test-repo.git')
    // Two validate/execute pairs: the GitHub phase (access + create) and the
    // shared origin-connect phase (local git).
    expect(steps).toEqual([
      'validate', 'execute',
      'validate', 'execute',
      'reinspect', 'complete',
    ])
  })

  it('creates a public repository when requested', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root, 'repository')
    const client = fakeClient()

    await new CreateGithubOriginActioner(asClient(client)).run(
      repository,
      { name: 'public-repo', visibility: 'public' },
      () => undefined,
    )

    expect(client.createRepository)
      .toHaveBeenCalledWith({ name: 'public-repo', private: false })
  })

  it('attaches origin to an existing repository without creating it', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root, 'repository')
    const client = fakeClient({
      repositoryExists: vi.fn(async () => true),
    })

    const result = await new CreateGithubOriginActioner(asClient(client)).run(
      repository,
      { name: 'existing-repo', visibility: 'private' },
      () => undefined,
    )

    expect(client.createRepository).not.toHaveBeenCalled()
    expect(result.remote).toBe('https://github.com/Ken24T/existing-repo.git')
    expect(git(repository, ['remote', 'get-url', 'origin']))
      .toBe('https://github.com/Ken24T/existing-repo.git')
  })

  it('refuses an invalid repository name before touching GitHub', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root, 'repository')
    const client = fakeClient()

    await expect(new CreateGithubOriginActioner(asClient(client)).run(
      repository,
      { name: 'bad name!', visibility: 'private' },
      () => undefined,
    )).rejects.toThrow('Repository name must be 1-100 alphanumeric')

    expect(client.readUser).not.toHaveBeenCalled()
    expect(() => git(repository, ['remote', 'get-url', 'origin']))
      .toThrow()
  })

  it('propagates GitHub authentication failures', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root, 'repository')
    const client = fakeClient({
      readUser: vi.fn(async () => {
        throw new AdviserError(
          'github-authentication-failed',
          'GitHub authentication failed.',
        )
      }),
    })

    await expect(new CreateGithubOriginActioner(asClient(client)).run(
      repository,
      { name: 'auth-repo', visibility: 'private' },
      () => undefined,
    )).rejects.toMatchObject({ code: 'github-authentication-failed' })
  })

  it('refuses to overwrite an existing origin remote after creating the repo', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(
      root,
      'repository',
      'https://github.com/Ken24T/existing.git',
    )
    const client = fakeClient()

    await expect(new CreateGithubOriginActioner(asClient(client)).run(
      repository,
      { name: 'conflict-repo', visibility: 'private' },
      () => undefined,
    )).rejects.toThrow('An origin remote is already configured.')

    // The repository was created on GitHub, but the local origin was untouched.
    expect(client.createRepository).toHaveBeenCalled()
    expect(git(repository, ['remote', 'get-url', 'origin']))
      .toBe('https://github.com/Ken24T/existing.git')
  })
})

describe('repository name validation', () => {
  it('accepts valid GitHub repository names', () => {
    expect(validateRepositoryName('repo')).toBe('repo')
    expect(validateRepositoryName('my-repo')).toBe('my-repo')
    expect(validateRepositoryName('my.repo_2')).toBe('my.repo_2')
    expect(validateRepositoryName('  padded  ')).toBe('padded')
  })

  it('rejects empty, oversized, and malformed names', () => {
    expect(() => validateRepositoryName('')).toThrow()
    expect(() => validateRepositoryName('   ')).toThrow()
    expect(() => validateRepositoryName('x'.repeat(101))).toThrow()
    expect(() => validateRepositoryName('-leading')).toThrow()
    expect(() => validateRepositoryName('trailing-')).toThrow()
    expect(() => validateRepositoryName('double..dot')).toThrow()
    expect(() => validateRepositoryName('bad name!')).toThrow()
  })
})
