import { describe, expect, it } from 'vitest'
import type { ServiceConfig } from './config'
import { RepositoryRegistry } from './registry'

const config: ServiceConfig = {
  allowedRoot: '/safe',
  repositoryPath: '/safe/TCTBP-Web',
  repositoryName: 'TCTBP-Web',
  commandTimeoutMs: 3_000,
  commandMaxOutputBytes: 1024,
}

describe('repository registry', () => {
  it('returns a stable opaque ID without exposing a path', () => {
    const registry = new RepositoryRegistry(config, Buffer.alloc(32, 7))
    const [repository] = registry.list()

    expect(repository.name).toBe('TCTBP-Web')
    expect(repository.id).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(JSON.stringify(repository)).not.toContain('/safe')
    expect(registry.require(repository.id).path).toBe('/safe/TCTBP-Web')
  })

  it('rejects an unknown opaque ID', () => {
    const registry = new RepositoryRegistry(config, Buffer.alloc(32, 7))
    expect(() => registry.require('not-registered')).toThrowError(
      expect.objectContaining({ code: 'repository-not-found' }),
    )
  })
})
