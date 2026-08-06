import { describe, expect, it } from 'vitest'
import {
  buildBootstrapPlan,
  validateBootstrapRequest,
} from './tctbp-bootstrap'

describe('TCTBP bootstrap planning', () => {
  it('validates target-specific settings and builds a non-applying plan', () => {
    const request = validateBootstrapRequest({
      projectName: 'ddre-intranet-roadmap',
      projectDescription: 'Roadmap manager.',
      branchStrategy: 'long-lived-environment-branches',
      workingBranch: 'development',
      preProductionBranch: 'review',
      productionBranch: 'main',
      testCommand: 'npm run test',
      buildCommand: 'npm run build',
      deployEnabled: false,
      includeHookLayer: true,
    })
    const plan = buildBootstrapPlan(
      {
        state: 'available',
        repository: 'TCTBP-Web',
        revision: 'a'.repeat(40),
        version: '0.2.0',
        managedFileCount: 49,
        message: null,
      },
      {
        branch: 'main',
        clean: true,
        detached: false,
        operationCount: 0,
      },
      request,
    )

    expect(plan).toMatchObject({
      sourceRevision: 'a'.repeat(40),
      managedFileCount: 49,
      recommendedBranch: 'upgrade/tctbp-bootstrap-aaaaaaa',
      applyAllowed: false,
      request,
    })
  })

  it('rejects simple strategy with a pre-production branch', () => {
    expect(() => validateBootstrapRequest({
      projectName: 'example',
      projectDescription: 'Example',
      branchStrategy: 'simple',
      workingBranch: 'development',
      preProductionBranch: 'review',
      productionBranch: 'main',
      testCommand: null,
      buildCommand: null,
      deployEnabled: false,
      includeHookLayer: false,
    })).toThrowError('Bootstrap configuration is incomplete or invalid.')
  })
})
