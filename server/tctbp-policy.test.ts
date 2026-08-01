import { describe, expect, it } from 'vitest'
import {
  compareTctbpPolicy,
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
