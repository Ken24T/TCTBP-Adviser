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
    )).toThrowError('Canonical TCTBP-Web manifest is missing GITHUB_FILES.')
  })

  it('reads the managed surface from the dedicated manifest module', () => {
    const source = `
      const RUNNER_FILES = ["tctbp-core.js"];
      const GITHUB_FILES = ["TCTBP Agent.md"];
      const PROMPT_FILES = ["Upgrade.prompt.md"];
      const CONTRACT_FILES = ["schemas/contract.json"];
    `

    expect(parseCanonicalManagedSurface(source)).toEqual([
      '.github/TCTBP Agent.md',
      '.github/prompts/Upgrade.prompt.md',
      'schemas/contract.json',
      'scripts/tctbp-core.js',
    ])
  })

  it('prefers the managed-surface module over the scaffold runner', () => {
    const moduleSource = [
      'const RUNNER_FILES = ["tctbp-core.js"];',
      'const GITHUB_FILES = ["TCTBP Agent.md"];',
      'const PROMPT_FILES = [];',
      'const CONTRACT_FILES = ["schemas/contract.json"];',
    ].join('\n')
    const runnerSource = [
      'const { RUNNER_FILES } = require("./tctbp-managed-surface");',
      'const RUNNER_FILES = ["stale-runner.js"];',
      'const GITHUB_FILES = [];',
      'const PROMPT_FILES = [];',
      'const CONTRACT_FILES = [];',
    ].join('\n')

    expect(parseCanonicalManagedSurface(moduleSource, runnerSource)).toEqual([
      '.github/TCTBP Agent.md',
      'schemas/contract.json',
      'scripts/tctbp-core.js',
    ])
  })

  it('falls back to the scaffold runner when no module is present', () => {
    const runnerSource = [
      'const RUNNER_FILES = ["tctbp-core.js", "tctbp-run-status.js"];',
      'const GITHUB_FILES = [];',
      'const PROMPT_FILES = [];',
      'const CONTRACT_FILES = [];',
    ].join('\n')

    expect(parseCanonicalManagedSurface(runnerSource)).toEqual([
      'scripts/tctbp-core.js',
      'scripts/tctbp-run-status.js',
    ])
  })
})
