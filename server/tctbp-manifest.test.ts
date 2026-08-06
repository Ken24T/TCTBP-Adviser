import { describe, expect, it } from 'vitest'
import { parseCanonicalManagedSurface } from './tctbp-manifest'

describe('canonical TCTBP managed surface parsing', () => {
  it('maps scaffold inventories to target-relative paths', () => {
    const source = `
      const RUNNER_FILES = ["tctbp-core.js", "tctbp-run-status.js"];
      const GITHUB_FILES = ["TCTBP Agent.md"];
      const PROMPT_FILES = ["Upgrade.prompt.md"];
      const CONTRACT_FILES = ["schemas/contract.json"];
    `

    expect(parseCanonicalManagedSurface(source)).toEqual([
      '.github/TCTBP Agent.md',
      '.github/prompts/Upgrade.prompt.md',
      'schemas/contract.json',
      'scripts/tctbp-core.js',
      'scripts/tctbp-run-status.js',
    ])
  })

  it('rejects a source without a required managed inventory', () => {
    expect(() => parseCanonicalManagedSurface(
      'const RUNNER_FILES = [];',
    )).toThrowError('Canonical scaffold runner is missing GITHUB_FILES.')
  })
})
