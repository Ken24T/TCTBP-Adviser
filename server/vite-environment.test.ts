import { rm, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import { loadAdviserEnvironment } from './vite-environment'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('Vite Adviser environment', () => {
  it('loads JSON settings from .env without losing their quotes', async () => {
    const directory = await temporaryDirectory()
    await writeFile(
      `${directory}/.env`,
      [
        'TCTBP_ADVISER_REPOSITORY_ROOTS=["/home/ken/repos"]',
        'TCTBP_ADVISER_GITHUB_ENABLED=false',
        'UNRELATED_SECRET=not-for-the-adviser',
      ].join('\n'),
    )
    await writeFile(
      `${directory}/.env.development`,
      'TCTBP_ADVISER_MAXIMUM_DEPTH=4\n',
    )

    const environment = loadAdviserEnvironment(
      'development',
      directory,
      {},
    )

    expect(environment).toMatchObject({
      TCTBP_ADVISER_REPOSITORY_ROOTS: '["/home/ken/repos"]',
      TCTBP_ADVISER_GITHUB_ENABLED: 'false',
      TCTBP_ADVISER_MAXIMUM_DEPTH: '4',
    })
    expect(environment.UNRELATED_SECRET).toBeUndefined()
  })

  it('gives explicit shell settings precedence over .env', async () => {
    const directory = await temporaryDirectory()
    await writeFile(
      `${directory}/.env`,
      'TCTBP_ADVISER_GITHUB_ENABLED=false\n',
    )

    const environment = loadAdviserEnvironment(
      'development',
      directory,
      { TCTBP_ADVISER_GITHUB_ENABLED: 'true' },
    )

    expect(environment.TCTBP_ADVISER_GITHUB_ENABLED).toBe('true')
  })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await createTemporaryDirectory()
  temporaryDirectories.push(directory)
  return directory
}
