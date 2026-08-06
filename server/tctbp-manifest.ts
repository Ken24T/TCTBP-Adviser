import path from 'node:path'
import { AdviserError } from './errors'

export const SCAFFOLD_RUNNER_PATH = 'scripts/tctbp-run-scaffold.js'

const MANAGED_ARRAYS = [
  ['RUNNER_FILES', 'scripts'],
  ['GITHUB_FILES', '.github'],
  ['PROMPT_FILES', '.github/prompts'],
  ['CONTRACT_FILES', ''],
] as const

export function parseCanonicalManagedSurface(
  scaffoldRunner: string,
): string[] {
  return Array.from(new Set(MANAGED_ARRAYS.flatMap(([name, prefix]) => (
    parseArray(scaffoldRunner, name).map((file) => (
      prefix ? path.posix.join(prefix, file) : file
    ))
  )))).sort()
}

function parseArray(source: string, name: string): string[] {
  const match = new RegExp(
    `const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`,
  ).exec(source)
  if (!match) {
    throw new AdviserError(
      'canonical-manifest-invalid',
      `Canonical scaffold runner is missing ${name}.`,
    )
  }

  const literals = match[1].match(/"[^"]*"/g) ?? []
  return literals.map((literal) => JSON.parse(literal) as string)
}
