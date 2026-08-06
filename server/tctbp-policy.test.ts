import { describe, expect, it } from 'vitest'
import {
  compareTctbpPolicy,
  mergeCanonicalTctbpPolicy,
  parseTctbpPolicy,
} from './tctbp-policy'

describe('semantic TCTBP policy comparison', () => {
  it('reports missing canonical capabilities, workflows, and hardening', () => {
    const source = parseTctbpPolicy(JSON.stringify({
      schemaVersion: 11,
      adviserContract: {
        major: 1,
        minor: 1,
        capabilities: ['inspection.local-v1', 'candidate-guard-v1'],
      },
      adviserVocabulary: { workflowIds: ['status', 'ship'] },
      candidateGuard: { enabled: true },
      codeLossPrevention: { enabled: true },
    }))
    const target = parseTctbpPolicy(JSON.stringify({
      schemaVersion: 10,
      adviserContract: {
        major: 1,
        minor: 0,
        capabilities: ['inspection.local-v1'],
      },
      adviserVocabulary: { workflowIds: ['status'] },
      codeLossPrevention: { enabled: true },
    }))

    expect(compareTctbpPolicy(source, target)).toEqual({
      state: 'drifted',
      differences: [
        {
          area: 'schema',
          message: 'Canonical schema version is 11; target is 10.',
        },
        {
          area: 'contract',
          message: 'Canonical contract minor version is 1; target is 0.',
        },
        {
          area: 'capabilities',
          message: 'Target is missing canonical capability(s): candidate-guard-v1.',
        },
        {
          area: 'workflows',
          message: 'Target is missing canonical workflow(s): ship.',
        },
        {
          area: 'hardening',
          message: 'candidateGuard is enabled canonically but not enabled in the target policy.',
        },
      ],
    })
  })

  it('merges canonical infrastructure while preserving project-owned values', () => {
    const merged = mergeCanonicalTctbpPolicy(
      JSON.stringify({
        schemaVersion: 11,
        candidateGuard: { enabled: true },
        project: { name: 'canonical-name' },
        profile: { developmentPolicy: { maxFileLines: { softCeiling: 250 } } },
      }),
      JSON.stringify({
        schemaVersion: 10,
        candidateGuard: { enabled: false },
        project: { name: 'project-name' },
        profile: {
          commands: { test: 'npm test' },
          developmentPolicy: { maxFileLines: { softCeiling: 999 } },
        },
      }),
    )

    expect(JSON.parse(merged as string)).toMatchObject({
      schemaVersion: 11,
      candidateGuard: { enabled: true },
      project: { name: 'project-name' },
      profile: {
        commands: { test: 'npm test' },
        developmentPolicy: { maxFileLines: { softCeiling: 250 } },
      },
    })
  })

  it('reports aligned policies and unavailable policy input', () => {
    const profile = JSON.stringify({
      schemaVersion: 11,
      adviserContract: { major: 1, minor: 0, capabilities: ['inspection.local-v1'] },
      adviserVocabulary: { workflowIds: ['status'] },
    })
    const parsed = parseTctbpPolicy(profile)

    expect(compareTctbpPolicy(parsed, parsed)).toEqual({
      state: 'aligned',
      differences: [],
    })
    expect(compareTctbpPolicy(parsed, null)).toMatchObject({
      state: 'unavailable',
      differences: [{ area: 'policy' }],
    })
  })
})
