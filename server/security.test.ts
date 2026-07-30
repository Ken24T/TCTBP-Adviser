import {
  mkdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import {
  readBoundedRepositoryFile,
  resolveAllowedRepository,
} from './security'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('repository path security', () => {
  it('accepts a real repository directory within its allowed root', async () => {
    const root = await temporaryRoot()
    const repository = path.join(root, 'repository')
    await mkdir(repository)

    await expect(resolveAllowedRepository(root, repository)).resolves.toEqual({
      allowedRoot: root,
      repositoryPath: repository,
    })
  })

  it('rejects a configured path outside the allowed root', async () => {
    const base = await temporaryRoot()
    const allowed = path.join(base, 'allowed')
    const outside = path.join(base, 'outside')
    await Promise.all([mkdir(allowed), mkdir(outside)])

    await expect(resolveAllowedRepository(allowed, outside)).rejects.toMatchObject({
      code: 'repository-outside-allowed-root',
    })
  })

  it.runIf(process.platform !== 'win32')(
    'rejects a repository symlink that escapes the allowed root',
    async () => {
      const base = await temporaryRoot()
      const allowed = path.join(base, 'allowed')
      const outside = path.join(base, 'outside')
      const linked = path.join(allowed, 'linked')
      await Promise.all([mkdir(allowed), mkdir(outside)])
      await symlink(outside, linked, 'dir')

      await expect(resolveAllowedRepository(allowed, linked)).rejects.toMatchObject({
        code: 'repository-outside-allowed-root',
      })
    },
  )

  it('rejects traversal when reading repository metadata', async () => {
    const root = await temporaryRoot()
    await expect(
      readBoundedRepositoryFile(root, '../outside.json'),
    ).rejects.toMatchObject({ code: 'repository-file-outside-root' })
  })

  it.runIf(process.platform !== 'win32')(
    'rejects a metadata-file symlink',
    async () => {
      const root = await temporaryRoot()
      const outside = path.join(path.dirname(root), 'outside.json')
      const metadata = path.join(root, 'metadata.json')
      await writeFile(outside, '{}')
      await symlink(outside, metadata)

      await expect(
        readBoundedRepositoryFile(root, 'metadata.json'),
      ).rejects.toMatchObject({ code: 'repository-file-symlink-rejected' })
      await rm(outside, { force: true })
    },
  )

  it('enforces repository metadata size limits before reading', async () => {
    const root = await temporaryRoot()
    await writeFile(path.join(root, 'large.json'), '{"data":"oversized"}')

    await expect(
      readBoundedRepositoryFile(root, 'large.json', 4),
    ).rejects.toMatchObject({ code: 'repository-file-too-large' })
  })
})

async function temporaryRoot(): Promise<string> {
  const root = await createTemporaryDirectory()
  temporaryDirectories.push(root)
  return root
}
