import { describe, expect, it } from 'vitest'
import { observationFixture } from '../../test/observation-fixture'
import {
  referenceCatalogue,
  repositoryReference,
} from './catalogue'

describe('TCTBP reference catalogue', () => {
  it('publishes the pinned core workflows and guardrails', () => {
    const catalogue = referenceCatalogue()

    expect(catalogue.contract).toMatchObject({
      major: 1,
      capability: 'workflow-catalogue.core-v1',
      sourceRevision: '0e99ceaf7436214a40bfcabbc79f57c36c91b035',
    })
    expect(catalogue.workflows.map((workflow) => workflow.id)).toEqual([
      'status',
      'checkpoint',
      'publish',
      'handover',
      'resume',
      'promote',
      'deploy',
      'ship',
      'abort',
      'branch',
    ])
    expect(catalogue.guardrails.length).toBeGreaterThanOrEqual(8)
  })

  it('marks advertised workflows and active local guardrails', () => {
    const reference = repositoryReference(observationFixture({
      clean: false,
      syncState: 'behind',
    }))

    expect(reference.workflows.find(
      (workflow) => workflow.id === 'checkpoint',
    )).toMatchObject({ advertised: true })
    expect(reference.workflows.find(
      (workflow) => workflow.id === 'deploy',
    )).toMatchObject({ advertised: false })
    expect(reference.guardrails).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'git.working-tree.dirty-behind',
        active: true,
      }),
      expect.objectContaining({
        id: 'git.branch.behind',
        active: true,
      }),
    ]))
  })

  it('uses review in a long-lived branch map', () => {
    const observation = observationFixture()
    observation.tctbp.branchModel = {
      strategy: 'long-lived',
      workingBranch: 'development',
      preProductionBranch: 'review',
      productionBranch: 'main',
      promotionTargets: ['review', 'production'],
    }

    const nodes = repositoryReference(observation).branchWorkflow.nodes

    expect(nodes.map((node) => node.branch)).toEqual([
      'development',
      'review',
      'main',
    ])
    expect(nodes[0].promoteTrigger).toBe('promote review please')
    expect(nodes[1].deployTrigger).toBe('deploy staging please')
  })

  it('collapses a simple strategy to one production node', () => {
    const observation = observationFixture()
    observation.head.branch = 'main'
    observation.tctbp.branchModel = {
      strategy: 'simple',
      workingBranch: 'main',
      preProductionBranch: null,
      productionBranch: 'main',
      promotionTargets: [],
    }

    const reference = repositoryReference(observation)

    expect(reference.branchWorkflow.nodes).toEqual([{
      role: 'production',
      branch: 'main',
      promoteTrigger: null,
      deployTrigger: 'deploy production please',
    }])
    expect(reference.workflows.find(
      (workflow) => workflow.id === 'ship',
    )?.applicableToCurrentBranch).toBe(true)
  })
})
