import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TctbpUpgradePlan } from '../shared/tctbp-upgrade'
import type { RepositoryObservation } from '../shared/inspection'
import { observationFixture } from '../test/observation-fixture'
import {
  createGitRepository,
  createTemporaryDirectory,
  git,
} from '../test/helpers'
import type { AiReviewStore } from './ai-review-store'
import type { RepositoryInspectionService } from './inspection'
import type { RegisteredRepository } from './registry'
import type { CanonicalTctbpSourceService } from './tctbp-source'
import {
  buildApplyRequest,
  UpgradeBatchRunner,
  type UpgradeBatchProgress,
} from './upgrade-batch-runner'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

function repository(root: string): RegisteredRepository {
  return { id: 'repo-1', name: 'repository', path: root }
}

function noWorkPlan(): TctbpUpgradePlan {
  return {
    fingerprint: 'fp',
    disposition: 'current',
    sourceAlignment: 'current',
    actionCounts: { preserve: 1, add: 0, review: 0, unavailable: 0 },
    blockers: [],
    policy: { state: 'aligned', differences: [] },
    source: {
      state: 'available',
      repository: 'TCTBP-Web',
      revision: 'a'.repeat(40),
      version: '0.3.0',
      managedFileCount: 1,
      message: null,
    },
    target: {
      sourceRepository: 'Ken24T/TCTBP-Web',
      sourceRevision: 'a'.repeat(40),
      sourceVersion: '0.3.0',
    },
    drift: {
      files: [],
      counts: { current: 1, 'missing-target': 0, drifted: 0, 'source-unavailable': 0 },
    },
  }
}

function seededReviewStore(fingerprint = 'fp'): AiReviewStore {
  return {
    get: vi.fn(() => ({
      status: 'available' as const,
      reviewId: 'review-1',
      planFingerprint: fingerprint,
    })),
  } as unknown as AiReviewStore
}

function runnerDeps(options: {
  inspect: (repository: RegisteredRepository) => Promise<RepositoryObservation>
  plan?: () => TctbpUpgradePlan
  apply?: (root: string, observation: RepositoryObservation, request: unknown) => Promise<unknown>
  merge?: (root: string, observation: RepositoryObservation) => Promise<unknown>
  cleanup?: (root: string, observation: RepositoryObservation) => Promise<unknown>
  review?: AiReviewStore
}) {
  return {
    inspections: {
      inspect: vi.fn(options.inspect),
    } as unknown as RepositoryInspectionService,
    tctbpSource: {
      plan: vi.fn(options.plan ?? noWorkPlan),
      apply: options.apply ?? vi.fn(async () => ({ status: 'applied' as const, appliedPaths: [], planFingerprint: 'fp', committed: false, pushed: false })),
      mergeUpgradeBranch: options.merge ?? vi.fn(),
      cleanupUpgradeBranch: options.cleanup ?? vi.fn(),
    } as unknown as CanonicalTctbpSourceService,
    aiReviewStore: options.review ?? seededReviewStore(),
  }
}

/** Last recorded status for a stage (the runner records running then a terminal state). */
function finalStatus(
  progress: Array<[string, string]>,
  stageId: string,
): string | undefined {
  return progress.filter(([id]) => id === stageId).at(-1)?.[1]
}

const batchRequest = {
  confirm: true as const,
  aiReviewId: 'review-1',
  aiReviewAcknowledged: true as const,
  planFingerprint: 'fp',
}

describe('upgrade batch runner', () => {
  it('skips every stage whose precondition is not met', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repo = await createGitRepository(root, 'repository')
    const deps = runnerDeps({
      inspect: async () => observationFixture({
        clean: true,
        remoteOrigin: null,
        syncState: 'in-sync',
      }),
    })
    const progress: Array<[string, string]> = []
    const record: UpgradeBatchProgress = (stageId, status) => {
      progress.push([stageId, status])
    }

    await new UpgradeBatchRunner(deps).run(repository(repo), batchRequest, record)

    expect(progress).toEqual([
      ['apply', 'skipped'],
      ['checkpoint', 'skipped'],
      ['publish', 'skipped'],
      ['merge', 'skipped'],
      ['cleanup', 'skipped'],
    ])
  })

  it('checkpoints a dirty tree and skips publish without an origin', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repo = await createGitRepository(root, 'repository')
    git(repo, ['config', 'user.email', 'test@example.com'])
    git(repo, ['config', 'user.name', 'Test Runner'])
    await writeFile(path.join(repo, 'change.txt'), 'change\n')
    const deps = runnerDeps({
      inspect: async () => observationFixture({
        clean: false,
        remoteOrigin: null,
      }),
    })
    const progress: Array<[string, string]> = []
    const record: UpgradeBatchProgress = (stageId, status) => {
      progress.push([stageId, status])
    }

    await new UpgradeBatchRunner(deps).run(repository(repo), batchRequest, record)

    expect([...new Set(progress.map((entry) => entry[0]))]).toEqual([
      'apply',
      'checkpoint',
      'publish',
      'merge',
      'cleanup',
    ])
    expect(finalStatus(progress, 'checkpoint')).toBe('completed')
    expect(finalStatus(progress, 'publish')).toBe('skipped')
    // The real repo gained the checkpoint commit and is clean again.
    expect(git(repo, ['rev-parse', 'HEAD'])).toHaveLength(40)
    expect(git(repo, ['status', '--porcelain'])).toBe('')
  })

  it('runs the apply stage when the plan has work pending', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repo = await createGitRepository(root, 'repository')
    const workPlan = {
      ...noWorkPlan(),
      disposition: 'review-required' as const,
      actionCounts: { preserve: 0, add: 2, review: 0, unavailable: 0 },
      drift: {
        files: [],
        counts: { current: 0, 'missing-target': 2, drifted: 0, 'source-unavailable': 0 },
      },
    }
    const apply = vi.fn(async () => ({
      status: 'applied' as const,
      appliedPaths: ['scripts/tctbp-core.js'],
      planFingerprint: 'fp',
      committed: false as const,
      pushed: false as const,
    }))
    const deps = runnerDeps({
      inspect: async () => observationFixture({
        clean: true,
        remoteOrigin: null,
      }),
      plan: () => workPlan,
      apply,
    })
    const progress: Array<[string, string]> = []
    const record: UpgradeBatchProgress = (stageId, status) => {
      progress.push([stageId, status])
    }

    await new UpgradeBatchRunner(deps).run(repository(repo), batchRequest, record)

    expect(apply).toHaveBeenCalledTimes(1)
    expect(finalStatus(progress, 'apply')).toBe('completed')
  })

  it('rejects a batch whose Jasper review is not available', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repo = await createGitRepository(root, 'repository')
    const deps = runnerDeps({
      inspect: async () => observationFixture(),
      review: { get: vi.fn(() => null) } as unknown as AiReviewStore,
    })

    await expect(new UpgradeBatchRunner(deps).run(
      repository(repo),
      batchRequest,
      () => undefined,
    )).rejects.toThrow('Jasper review')
  })

  it('stops at the first failed stage', async () => {
    const root = await createTemporaryDirectory()
    temporaryDirectories.push(root)
    const repo = await createGitRepository(root, 'repository')
    const workPlan = {
      ...noWorkPlan(),
      disposition: 'review-required' as const,
      actionCounts: { preserve: 0, add: 1, review: 0, unavailable: 0 },
      drift: {
        files: [],
        counts: { current: 0, 'missing-target': 1, drifted: 0, 'source-unavailable': 0 },
      },
    }
    const apply = vi.fn(async () => {
      throw new Error('apply exploded')
    })
    const deps = runnerDeps({
      inspect: async () => observationFixture(),
      plan: () => workPlan,
      apply,
    })
    const progress: Array<[string, string]> = []
    const record: UpgradeBatchProgress = (stageId, status) => {
      progress.push([stageId, status])
    }

    await expect(new UpgradeBatchRunner(deps).run(
      repository(repo),
      batchRequest,
      record,
    )).rejects.toThrow('apply exploded')

    expect(finalStatus(progress, 'apply')).toBe('failed')
    // Stages after the failure were never processed by the runner; the store
    // marks any pending stages skipped when the run fails.
    expect(finalStatus(progress, 'checkpoint')).toBeUndefined()
  })
})

describe('buildApplyRequest', () => {
  it('orders policy, additions, drifted, and obsolete-deletion steps', () => {
    const plan: TctbpUpgradePlan = {
      ...noWorkPlan(),
      disposition: 'review-required',
      policy: { state: 'drifted', differences: [] },
      actionCounts: { preserve: 0, add: 3, review: 2, unavailable: 0 },
      drift: {
        files: [
          { path: 'scripts/tctbp-core.js', state: 'drifted', action: 'review', sourceHash: 's', targetHash: 't' },
        ],
        counts: { current: 0, 'missing-target': 3, drifted: 1, 'source-unavailable': 0 },
        obsoleteTargets: [{ path: 'scripts/old.js', targetHash: 't' }],
      },
    }
    const request = buildApplyRequest(plan, batchRequest)
    const steps = request.steps ?? []

    expect(steps.map((step) => step.mode)).toEqual([
      'approved-managed-files',
      'additions-only',
      'approved-managed-files',
      'approved-managed-files',
    ])
    expect(steps[0].approvedPaths).toEqual(['.github/TCTBP.json'])
    expect(steps[2].approvedPaths).toEqual(['scripts/tctbp-core.js'])
    expect(steps[3].approvedDeletionPaths).toEqual(['scripts/old.js'])
    expect(steps[3].confirmDeletions).toBe(true)
    expect(request.aiReviewId).toBe('review-1')
  })
})
