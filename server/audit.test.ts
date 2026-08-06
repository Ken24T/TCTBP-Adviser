import { describe, expect, it } from 'vitest'
import { AdviserError } from './errors'
import { InspectionAuditLog } from './audit'

describe('bounded inspection audit log', () => {
  it('records success and safe failure metadata without paths', async () => {
    const dates = [
      new Date('2026-07-30T01:00:00.000Z'),
      new Date('2026-07-30T01:00:00.025Z'),
      new Date('2026-07-30T01:01:00.000Z'),
      new Date('2026-07-30T01:01:00.010Z'),
    ]
    let identifier = 0
    const audit = new InspectionAuditLog(
      2,
      () => dates.shift()!,
      () => `audit-${++identifier}`,
    )

    await expect(audit.capture('opaque-one', async () => 'ok'))
      .resolves.toBe('ok')
    await expect(audit.capture('opaque-two', async () => {
      throw new AdviserError('git-command-timeout', '/private/path')
    })).rejects.toThrow()

    expect(audit.list()).toEqual([
      {
        id: 'audit-2',
        repositoryId: 'opaque-two',
        startedAt: '2026-07-30T01:01:00.000Z',
        completedAt: '2026-07-30T01:01:00.010Z',
        durationMs: 10,
        outcome: 'failure',
        errorCode: 'git-command-timeout',
      },
      expect.objectContaining({
        id: 'audit-1',
        repositoryId: 'opaque-one',
        durationMs: 25,
        outcome: 'success',
        errorCode: null,
      }),
    ])
    expect(JSON.stringify(audit.list())).not.toContain('/private/path')
  })

  it('retains only its bounded number of newest entries', async () => {
    const audit = new InspectionAuditLog(2)

    await audit.capture('one', async () => undefined)
    await audit.capture('two', async () => undefined)
    await audit.capture('three', async () => undefined)

    expect(audit.list().map((entry) => entry.repositoryId)).toEqual([
      'three',
      'two',
    ])
  })
})
