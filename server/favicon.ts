import { access, readdir, readFile } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import path from 'node:path'

/** Common favicon locations inside a repository, in priority order. */
const FAVICON_CANDIDATES = [
  'public/favicon.svg',
  'public/favicon.ico',
  'public/favicon.png',
  'public/favicon.webp',
  'favicon.svg',
  'favicon.ico',
  'favicon.png',
]

/** Directories never scanned for deep favicons (mirror discovery excludes). */
const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'archive',
  '.cache',
])

/** Cap on how deep the recursive favicon scan descends. */
const MAX_SCAN_DEPTH = 8

/** Favicon preference order when multiple are found deep in the repo. */
const EXTENSION_RANK: Record<string, number> = {
  '.svg': 0,
  '.ico': 1,
  '.png': 2,
  '.webp': 3,
}

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/**
 * Returns the repo-relative path of the first favicon file found inside the
 * repository, or null when the repository has no recognizable favicon. Checks
 * the conventional locations first (repo-root `public/` then the root), then
 * falls back to a bounded recursive scan so favicons nested anywhere in the
 * tree (e.g. a webpart's `src/.../public/favicon.svg`) are still found.
 */
export async function resolveRepositoryFavicon(
  repositoryPath: string,
): Promise<string | null> {
  for (const candidate of FAVICON_CANDIDATES) {
    try {
      await access(path.join(repositoryPath, candidate))
      return candidate
    } catch {
      // candidate not present — keep looking
    }
  }
  const deep = await findDeepFavicon(repositoryPath, repositoryPath, '', 0)
  return deep?.relative ?? null
}

/**
 * Recursively looks for `favicon.{svg,ico,png,webp}` files, preferring ones
 * inside a `public/` directory, then `.svg`, then shallower paths. Returns the
 * best repo-relative path and its score, or null when none exists.
 */
async function findDeepFavicon(
  repositoryPath: string,
  currentPath: string,
  relativePath: string,
  depth: number,
): Promise<{ relative: string; score: number } | null> {
  if (depth > MAX_SCAN_DEPTH) return null
  let entries: Dirent[]
  try {
    entries = await readdir(currentPath, { withFileTypes: true })
  } catch {
    return null
  }
  let best: { relative: string; score: number } | null = null
  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name)
    const entryRelative = relativePath
      ? path.join(relativePath, entry.name)
      : entry.name
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      const nested = await findDeepFavicon(
        repositoryPath,
        entryPath,
        entryRelative,
        depth + 1,
      )
      if (nested && (!best || nested.score < best.score)) best = nested
      continue
    }
    const match = /^favicon\.(svg|ico|png|webp)$/i.exec(entry.name)
    if (!match) continue
    const extension = `.${match[1].toLowerCase()}`
    const inPublicDirectory = path.basename(currentPath) === 'public'
    const score = (inPublicDirectory ? 0 : 10_000)
      + (EXTENSION_RANK[extension] ?? 4) * 100
      + depth
    const candidate = { relative: entryRelative, score }
    if (!best || candidate.score < best.score) best = candidate
  }
  return best
}

/**
 * Reads a resolved favicon file into a response body and its content type.
 * Returns null when the file can no longer be read.
 */
export async function readRepositoryFavicon(
  repositoryPath: string,
  relativePath: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  try {
    const body = await readFile(path.join(repositoryPath, relativePath))
    const contentType = CONTENT_TYPES[path.extname(relativePath).toLowerCase()]
      ?? 'application/octet-stream'
    return { body, contentType }
  } catch {
    return null
  }
}
