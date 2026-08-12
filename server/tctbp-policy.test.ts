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

  it('preserves the target template identity when merging governance', () => {
    const merged = mergeCanonicalTctbpPolicy(
      JSON.stringify({
        governance: {
          sourceOfTruth: 'TCTBP.json',
          fallbackDocument: 'TCTBP Agent.md',
          templateMode: true,
          templateType: 'web',
          templateInstructions: 'This repository is the canonical source.',
        },
        candidateGuard: { enabled: true },
      }),
      JSON.stringify({
        governance: {
          sourceOfTruth: 'TCTBP.json',
          fallbackDocument: 'TCTBP Agent.md',
          templateMode: false,
          templateInstructions: 'Preserve repo-specific commands.',
        },
      }),
    )

    expect(JSON.parse(merged as string).governance).toMatchObject({
      sourceOfTruth: 'TCTBP.json',
      fallbackDocument: 'TCTBP Agent.md',
      templateMode: false,
      templateInstructions: 'Preserve repo-specific commands.',
    })
  })

  it('defaults governance to a non-template profile when the target has none', () => {
    const merged = mergeCanonicalTctbpPolicy(
      JSON.stringify({
        governance: {
          sourceOfTruth: 'TCTBP.json',
          fallbackDocument: 'TCTBP Agent.md',
          templateMode: true,
          templateType: 'web',
        },
      }),
      JSON.stringify({ schemaVersion: 10 }),
    )

    expect(JSON.parse(merged as string).governance).toMatchObject({
      sourceOfTruth: 'TCTBP.json',
      fallbackDocument: 'TCTBP Agent.md',
      templateMode: false,
    })
  })

  it('unions canonical activation with target triggers and filters inapplicable families', () => {
    const merged = mergeCanonicalTctbpPolicy(
      JSON.stringify({
        activation: {
          triggers: [
            'ship', 'ship please',
            'checkpoint', 'checkpoint please',
            'promote staging', 'promote production',
            'deploy dev', 'deploy production', 'deploy', 'deploy please',
            'scaffold', 'new project',
            'preflight', 'preflight please',
          ],
          caseInsensitive: true,
        },
      }),
      JSON.stringify({
        branchModel: { strategy: 'simple', productionBranch: 'master' },
        deploy: {
          preferredTriggers: ['deploy', 'deploy please'],
          targets: { 'current-platform-artifacts': { aliases: [] } },
        },
        activation: {
          triggers: ['deploy', 'deploy please', 'custom-trigger'],
          caseInsensitive: true,
        },
      }),
    )

    const triggers = (JSON.parse(merged as string).activation.triggers) as string[]
    expect(triggers).toContain('checkpoint')
    expect(triggers).toContain('preflight')
    expect(triggers).toContain('deploy') // bare deploy kept: deploy is configured
    expect(triggers).toContain('custom-trigger') // target-specific trigger preserved
    expect(triggers).not.toContain('promote staging') // simple strategy
    expect(triggers).not.toContain('promote production')
    expect(triggers).not.toContain('deploy dev') // no dev target mapped
    expect(triggers).not.toContain('deploy production')
    expect(triggers).not.toContain('scaffold') // factory-only
    expect(triggers).not.toContain('new project')
  })

  it('keeps promote and mapped deploy variants for a staged target', () => {
    const merged = mergeCanonicalTctbpPolicy(
      JSON.stringify({
        activation: {
          triggers: [
            'promote staging', 'promote production', 'promote review',
            'deploy dev', 'deploy staging', 'deploy production', 'deploy prod',
          ],
        },
      }),
      JSON.stringify({
        branchModel: {
          strategy: 'staged',
          workingBranch: 'development',
          promoteEnabled: true,
        },
        deploy: {
          preferredTriggers: ['deploy'],
          targets: {
            dev: { aliases: ['development'] },
            staging: { aliases: [] },
            production: { aliases: ['prod'] },
          },
        },
      }),
    )

    const triggers = (JSON.parse(merged as string).activation.triggers) as string[]
    expect(triggers).toContain('promote staging')
    expect(triggers).toContain('promote production')
    expect(triggers).not.toContain('promote review') // no review environment
    expect(triggers).toContain('deploy dev')
    expect(triggers).toContain('deploy staging')
    expect(triggers).toContain('deploy production')
    expect(triggers).toContain('deploy prod') // prod alias maps to the production target
  })

  it('migrates prepare release ownership from ship to release', () => {
    const merged = mergeCanonicalTctbpPolicy(
      JSON.stringify({
        activation: {
          triggers: ['release', 'prepare release', 'prepare release please', 'ship'],
        },
      }),
      JSON.stringify({
        ship: { preferredTriggers: ['ship', 'ship please', 'prepare release'] },
        release: { preferredTriggers: ['release'] },
        activation: { triggers: ['ship', 'prepare release'] },
      }),
    )

    const mergedProfile = JSON.parse(merged as string)
    expect(mergedProfile.ship.preferredTriggers).toEqual(['ship', 'ship please'])
    expect(mergedProfile.release.preferredTriggers).toContain('prepare release')
    expect(mergedProfile.release.preferredTriggers).toContain('prepare release please')
    expect(mergedProfile.activation.triggers).toContain('prepare release')
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
