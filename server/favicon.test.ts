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

  it('finds a favicon nested deep in the repository tree', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    await mkdir(path.join(root, 'spfx', 'intranet-core', 'dev', 'public'), {
      recursive: true,
    })
    await writeFile(
      path.join(root, 'spfx', 'intranet-core', 'dev', 'public', 'favicon.svg'),
      '<svg />',
    )

    expect(await resolveRepositoryFavicon(root))
      .toBe('spfx/intranet-core/dev/public/favicon.svg')
  })

  it('ignores node_modules when scanning for a deep favicon', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    await mkdir(path.join(root, 'node_modules', 'dep'), { recursive: true })
    await writeFile(
      path.join(root, 'node_modules', 'dep', 'favicon.png'),
      'noise',
    )

    expect(await resolveRepositoryFavicon(root)).toBeNull()
  })

  it('prefers a public/ favicon over a deeper root-level one', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    await mkdir(path.join(root, 'assets'), { recursive: true })
    await writeFile(path.join(root, 'assets', 'favicon.ico'), 'old')
    await mkdir(path.join(root, 'src', 'public'), { recursive: true })
    await writeFile(path.join(root, 'src', 'public', 'favicon.svg'), '<svg />')

    expect(await resolveRepositoryFavicon(root)).toBe('src/public/favicon.svg')
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
