import { rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createGitRepository,
  createTemporaryDirectory,
  git,
} from '../test/helpers'
import { OriginActioner } from './origin-actioner'
import { validateOriginUrl } from './origin-url'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('origin actioner', () => {
  it('adds an origin remote when none exists', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root, 'repository')
    const steps: string[] = []

    const result = await new OriginActioner().run(
      repository,
      'https://github.com/Ken24T/smoke.git',
      (step) => { steps.push(step) },
    )

    expect(result).toMatchObject({
      workflowId: 'add-origin',
      remote: 'https://github.com/Ken24T/smoke.git',
      pushed: false,
      verifiedClean: true,
    })
    expect(git(repository, ['remote', 'get-url', 'origin']))
      .toBe('https://github.com/Ken24T/smoke.git')
    expect(steps).toEqual(['validate', 'execute', 'reinspect', 'complete'])
  })

  it('accepts scp-like ssh syntax', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root, 'repository')

    const result = await new OriginActioner().run(
      repository,
      'git@github.com:Ken24T/smoke.git',
      () => undefined,
    )

    expect(result.remote).toBe('git@github.com:Ken24T/smoke.git')
    expect(git(repository, ['remote', 'get-url', 'origin']))
      .toBe('git@github.com:Ken24T/smoke.git')
  })

  it('refuses to overwrite an existing origin remote', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(
      root,
      'repository',
      'https://github.com/Ken24T/existing.git',
    )

    await expect(new OriginActioner().run(
      repository,
      'https://github.com/Ken24T/other.git',
      () => undefined,
    )).rejects.toThrow('An origin remote is already configured.')

    expect(git(repository, ['remote', 'get-url', 'origin']))
      .toBe('https://github.com/Ken24T/existing.git')
  })

  it('rejects an invalid URL before touching git', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repository = await createGitRepository(root, 'repository')

    await expect(new OriginActioner().run(
      repository,
      'ftp://example.com/repo.git',
      () => undefined,
    )).rejects.toThrow('Origin URL must use http, https, ssh, or git.')
  })
})

describe('origin URL validation', () => {
  it('accepts http(s), ssh, git, and scp-like URLs', () => {
    expect(validateOriginUrl('https://github.com/o/r.git'))
      .toBe('https://github.com/o/r.git')
    expect(validateOriginUrl('ssh://git@github.com/o/r.git'))
      .toBe('ssh://git@github.com/o/r.git')
    expect(validateOriginUrl('git://example.com/o/r.git'))
      .toBe('git://example.com/o/r.git')
    expect(validateOriginUrl('git@github.com:o/r.git'))
      .toBe('git@github.com:o/r.git')
  })

  it('rejects empty, whitespace, and control characters', () => {
    expect(() => validateOriginUrl('')).toThrowError('non-empty')
    expect(() => validateOriginUrl('   ')).toThrowError('non-empty')
    expect(() => validateOriginUrl('https://x\n.github.com/repo.git'))
      .toThrowError('single, non-empty')
  })

  it('rejects unsupported schemes', () => {
    expect(() => validateOriginUrl('ftp://example.com/repo.git'))
      .toThrowError('http, https, ssh, or git')
    expect(() => validateOriginUrl('file:///tmp/repo'))
      .toThrowError('http, https, ssh, or git')
  })
})
