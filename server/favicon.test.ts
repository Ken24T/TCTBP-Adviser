import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import {
  readRepositoryFavicon,
  resolveRepositoryFavicon,
} from './favicon'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('repository favicon resolver', () => {
  it('finds a public favicon.svg inside the repository', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    await mkdir(path.join(root, 'public'))
    await writeFile(path.join(root, 'public', 'favicon.svg'), '<svg />')

    expect(await resolveRepositoryFavicon(root)).toBe('public/favicon.svg')
  })

  it('returns null when the repository has no favicon', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    await writeFile(path.join(root, 'index.html'), '<html></html>')

    expect(await resolveRepositoryFavicon(root)).toBeNull()
  })

  it('reads a favicon with the matching content type', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    await mkdir(path.join(root, 'public'))
    await writeFile(path.join(root, 'public', 'favicon.svg'), '<svg/>')

    const favicon = await readRepositoryFavicon(root, 'public/favicon.svg')
    expect(favicon).not.toBeNull()
    expect(favicon!.contentType).toBe('image/svg+xml')
    expect(new TextDecoder().decode(favicon!.body)).toBe('<svg/>')
  })
})
