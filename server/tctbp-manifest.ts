import path from 'node:path'
import { AdviserError } from './errors'

export const SCAFFOLD_RUNNER_PATH = 'scripts/tctbp-run-scaffold.js'
export const MANAGED_SURFACE_PATH = 'scripts/tctbp-managed-surface.js'

const MANAGED_ARRAYS = [
  ['RUNNER_FILES', 'scripts'],
  ['GITHUB_FILES', '.github'],
  ['PROMPT_FILES', '.github/prompts'],
  ['CONTRACT_FILES', ''],
] as const

/**
 * Parses the canonical managed surface from the TCTBP-Web checkout. Newer
 * releases define the arrays in scripts/tctbp-managed-surface.js (the single
 * source of truth, required by the scaffold runner); older releases inlined
 * them in the scaffold runner itself. Each array is read from the first
 * source that defines it, so pass the managed-surface module before the
 * scaffold runner.
 */
export function parseCanonicalManagedSurface(
  ...sources: readonly string[]
): string[] {
  return Array.from(new Set(MANAGED_ARRAYS.flatMap(([name, prefix]) => (
    parseArray(sources, name).map((file) => (
      prefix ? path.posix.join(prefix, file) : file
    ))
  )))).sort()
}

function parseArray(sources: readonly string[], name: string): string[] {
  for (const source of sources) {
    const match = new RegExp(
      `const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`,
    ).exec(source)
    if (!match) continue
    const literals = match[1].match(/"[^"]*"/g) ?? []
    return literals.map((literal) => JSON.parse(literal) as string)
  }
  throw new AdviserError(
    'canonical-manifest-invalid',
    `Canonical TCTBP-Web manifest is missing ${name}.`,
  )
}
