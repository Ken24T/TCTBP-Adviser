import {
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import path from 'node:path'
import { createApiHandler } from '../server/api'
import { createApiRuntime } from '../server/api-runtime'
import type { ServiceConfig } from '../server/config'
import {
  createGitRepository,
  createTemporaryDirectory,
} from './helpers'

const servers: Server[] = []
const temporaryDirectories: string[] = []

export interface RunningApi {
  url: string
  token: string
  repository: string
}

export async function cleanupApis(): Promise<void> {
  await Promise.all(servers.splice(0).map(
    (server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    }),
  ))
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
}

export async function startApi(
  includePlainRepository = false,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<RunningApi> {
  const root = await createTemporaryDirectory()
  temporaryDirectories.push(root)
  const repository = await createGitRepository(
    root,
    'repository',
    'https://github.com/Ken24T/fixture.git',
  )
  if (includePlainRepository) {
    await createGitRepository(root, 'plain-repository')
  }
  await writeProfile(repository)
  const token = 'test-session-token'
  const runtime = createApiRuntime(
    serviceConfig(root),
    token,
    {
      ...environment,
      TCTBP_ADVISER_ALLOWED_ROOT: environment.TCTBP_ADVISER_ALLOWED_ROOT ?? root,
    },
  )
  const server = createServer(createApiHandler(runtime))
  servers.push(server)
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Test API did not bind to a TCP port.')
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    token,
    repository,
  }
}

export function authorisedFetch(
  url: string,
  running: RunningApi,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      'X-TCTBP-Session': running.token,
    },
  })
}

function serviceConfig(root: string): ServiceConfig {
  return {
    repositoryRoots: [root],
    excludeDirectories: ['.git', 'node_modules', 'dist', 'build', 'archive'],
    maximumDepth: 3,
    maximumDirectories: 5_000,
    maximumRepositories: 200,
    portfolioCacheTtlMs: 30_000,
    inspectionConcurrency: 4,
    commandTimeoutMs: 3_000,
    commandMaxOutputBytes: 1024 * 1024,
    github: {
      enabled: false,
      token: null,
      repositories: [],
      timeoutMs: 5_000,
      maxResponseBytes: 2_097_152,
      cacheTtlMs: 60_000,
      concurrency: 3,
    },
  }
}

async function writeProfile(repository: string): Promise<void> {
  const profileDirectory = path.join(repository, '.github')
  await mkdir(profileDirectory)
  await writeFile(
    path.join(profileDirectory, 'TCTBP.json'),
    JSON.stringify({
      schemaVersion: 11,
      project: {
        name: 'repository',
        description: 'A repository under test.',
      },
      branchModel: {
        strategy: 'staged',
        workingBranch: 'development',
        stagingBranch: 'staging',
        productionBranch: 'main',
        promoteEnabled: true,
      },
      profile: {
        commands: {
          test: 'npm test',
          lint: null,
          build: 'npm run build',
        },
        qualityGates: {
          requireTestsBeforeShip: true,
          requireLintBeforeShip: false,
          requireBuildBeforeShip: true,
        },
      },
      adviserContract: {
        major: 1,
        minor: 0,
        capabilities: [
          'inspection.local-v1',
          'workflow-catalogue.core-v1',
          'reason-codes.core-v1',
        ],
      },
      adviserVocabulary: {
        workflowIds: [
          'status',
          'checkpoint',
          'publish',
          'resume',
          'handover',
        ],
      },
    }),
  )
}
