import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export async function createTemporaryDirectory(
  prefix = 'tctbp-adviser-',
): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

export async function createGitRepository(
  parent: string,
  name = 'repository',
  origin: string | null = null,
): Promise<string> {
  const repository = path.join(parent, name)
  await mkdir(repository, { recursive: true })
  git(repository, ['init', '-b', 'development'])
  git(repository, ['config', 'user.name', 'TCTBP Test'])
  git(repository, ['config', 'user.email', 'test@example.invalid'])
  await writeFile(path.join(repository, 'README.md'), '# Test repository\n')
  git(repository, ['add', 'README.md'])
  git(repository, ['commit', '-m', 'test: initial commit'])
  if (origin) {
    git(repository, ['remote', 'add', 'origin', origin])
  }
  return repository
}

export function git(repository: string, args: string[]): string {
  return execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}
