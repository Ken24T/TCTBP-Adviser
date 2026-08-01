import {
  chmod,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTemporaryDirectory } from '../test/helpers'
import {
  BoundedGitExecutor,
  createGitInvocation,
  GIT_COMMANDS,
} from './git-command'

const temporaryDirectories: string[] = []
const originalPath = process.env.PATH

afterEach(async () => {
  process.env.PATH = originalPath
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('bounded Git command construction', () => {
  it('uses fixed non-shell arguments and bounded resources', () => {
    const invocation = createGitInvocation(
      '/safe/repository',
      GIT_COMMANDS.status,
      1_500,
      32_768,
    )

    expect(invocation.executable).toBe('git')
    expect(invocation.options).toMatchObject({
      shell: false,
      timeout: 1_500,
      maxBuffer: 32_768,
      windowsHide: true,
    })
    expect(invocation.args).toEqual(expect.arrayContaining([
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'credential.helper=',
      '-C',
      '/safe/repository',
      'status',
      '--porcelain=v2',
      '--branch',
      '-z',
    ]))
    expect(invocation.options.env).toMatchObject({
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
    })
  })

  it('contains no fetch or repository-provided command descriptor', () => {
    const commandArguments = Object.values(GIT_COMMANDS)
      .flatMap((command) => command.args)
    expect(commandArguments).not.toContain('fetch')
    expect(Object.keys(GIT_COMMANDS).sort()).toEqual([
      'gitDir',
      'head',
      'originUrl',
      'status',
      'topLevel',
    ])
  })

  it.runIf(process.platform !== 'win32')(
    'terminates an inspection command that exceeds its time limit',
    async () => {
      const executableDirectory = await fakeGit('#!/bin/sh\nsleep 2\n')
      process.env.PATH = `${executableDirectory}${path.delimiter}${originalPath}`
      const executor = new BoundedGitExecutor(20, 1024)

      await expect(
        executor.run('/safe/repository', GIT_COMMANDS.status),
      ).rejects.toMatchObject({ code: 'git-command-timeout' })
    },
  )

  it.runIf(process.platform !== 'win32')(
    'terminates an inspection command that exceeds its output limit',
    async () => {
      const executableDirectory = await fakeGit(
        '#!/bin/sh\nhead -c 2048 /dev/zero\n',
      )
      process.env.PATH = `${executableDirectory}${path.delimiter}${originalPath}`
      const executor = new BoundedGitExecutor(1_000, 32)

      await expect(
        executor.run('/safe/repository', GIT_COMMANDS.status),
      ).rejects.toMatchObject({ code: 'git-output-limit-exceeded' })
    },
  )
})

async function fakeGit(content: string): Promise<string> {
  const directory = await createTemporaryDirectory('tctbp-fake-git-')
  temporaryDirectories.push(directory)
  const executable = path.join(directory, 'git')
  await writeFile(executable, content)
  await chmod(executable, 0o700)
  return directory
}
