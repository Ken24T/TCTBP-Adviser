import { execFile } from 'node:child_process'
import { AdviserError } from './errors'

export interface GitCommandResult {
  stdout: string
  stderr: string
}

export interface GitExecutor {
  run(repositoryPath: string, command: GitCommand): Promise<GitCommandResult>
}

export interface GitCommand {
  readonly id: 'status' | 'top-level' | 'git-dir' | 'origin-url' | 'head'
  readonly args: readonly string[]
  readonly allowedExitCodes?: readonly number[]
}

export const GIT_COMMANDS = {
  status: {
    id: 'status',
    args: [
      'status',
      '--porcelain=v2',
      '--branch',
      '--untracked-files=all',
      '-z',
    ],
  },
  topLevel: {
    id: 'top-level',
    args: ['rev-parse', '--path-format=absolute', '--show-toplevel'],
  },
  gitDir: {
    id: 'git-dir',
    args: ['rev-parse', '--path-format=absolute', '--git-dir'],
  },
  originUrl: {
    id: 'origin-url',
    args: ['config', '--get', 'remote.origin.url'],
    allowedExitCodes: [1],
  },
  head: {
    id: 'head',
    args: ['rev-parse', 'HEAD'],
  },
} as const satisfies Record<string, GitCommand>

const SAFE_GIT_CONFIG = [
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.untrackedCache=false',
  '-c', 'credential.helper=',
  '-c', 'submodule.recurse=false',
  '-c', 'fetch.recurseSubmodules=false',
  '-c', 'diff.external=',
] as const

export interface GitInvocation {
  executable: 'git'
  args: string[]
  options: {
    encoding: 'utf8'
    timeout: number
    maxBuffer: number
    windowsHide: true
    shell: false
    env: NodeJS.ProcessEnv
  }
}

export class BoundedGitExecutor implements GitExecutor {
  constructor(
    readonly timeoutMs: number,
    readonly maxOutputBytes: number,
  ) {}

  run(
    repositoryPath: string,
    command: GitCommand,
  ): Promise<GitCommandResult> {
    const invocation = createGitInvocation(
      repositoryPath,
      command,
      this.timeoutMs,
      this.maxOutputBytes,
    )

    return new Promise((resolve, reject) => {
      execFile(
        invocation.executable,
        invocation.args,
        invocation.options,
        (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr })
          return
        }

        const exitCode = typeof error.code === 'number' ? error.code : null
        if (
          exitCode !== null
          && command.allowedExitCodes?.includes(exitCode)
        ) {
          resolve({ stdout, stderr })
          return
        }

        reject(new AdviserError(
          classifyCommandError(error),
          `Git inspection command '${command.id}' failed.`,
          { cause: error },
        ))
        },
      )
    })
  }
}

export function createGitInvocation(
  repositoryPath: string,
  command: GitCommand,
  timeoutMs: number,
  maxOutputBytes: number,
): GitInvocation {
  return {
    executable: 'git',
    args: [
      ...SAFE_GIT_CONFIG,
      '-C',
      repositoryPath,
      ...command.args,
    ],
    options: {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: maxOutputBytes,
      windowsHide: true,
      shell: false,
      env: safeGitEnvironment(),
    },
  }
}

export function safeGitEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C',
  }
}

function classifyCommandError(
  error: { code?: string | number | null; killed?: boolean },
): string {
  if (error.killed || error.code === 'ETIMEDOUT') {
    return 'git-command-timeout'
  }
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return 'git-output-limit-exceeded'
  }
  return 'git-command-failed'
}
