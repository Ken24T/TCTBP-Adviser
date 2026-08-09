import { access, readFile } from 'node:fs/promises'
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

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/**
 * Returns the repo-relative path of the first favicon file found inside the
 * repository, or null when the repository has no recognizable favicon.
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
  return null
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
