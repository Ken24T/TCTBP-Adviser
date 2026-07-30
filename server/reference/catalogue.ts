import type { RepositoryObservation } from '../../shared/inspection'
import type {
  BranchWorkflowNode,
  ReferenceCatalogue,
  RepositoryReference,
} from '../../shared/reference'
import { GUARDRAIL_REFERENCES } from './guardrails'
import { WORKFLOW_REFERENCES } from './workflows'

const SOURCE_REVISION = '0e99ceaf7436214a40bfcabbc79f57c36c91b035'

export function referenceCatalogue(): ReferenceCatalogue {
  return {
    contract: {
      name: 'tctbp-adviser-inspection',
      major: 1,
      capability: 'workflow-catalogue.core-v1',
      sourceRevision: SOURCE_REVISION,
    },
    workflows: WORKFLOW_REFERENCES.map(copyWorkflow),
    guardrails: GUARDRAIL_REFERENCES.map((guardrail) => ({
      ...guardrail,
      blocks: [...guardrail.blocks],
    })),
  }
}

export function repositoryReference(
  observation: RepositoryObservation,
): RepositoryReference {
  const activeGuardrails = activeGuardrailIds(observation)
  const role = currentRole(observation)
  return {
    workflows: WORKFLOW_REFERENCES.map((workflow) => ({
      ...copyWorkflow(workflow),
      advertised: observation.tctbp.workflows.includes(workflow.id),
      applicableToCurrentBranch: workflowApplies(workflow.id, role),
    })),
    guardrails: GUARDRAIL_REFERENCES.map((guardrail) => ({
      ...guardrail,
      blocks: [...guardrail.blocks],
      active: activeGuardrails.has(guardrail.id),
    })),
    branchWorkflow: {
      strategy: observation.tctbp.branchModel.strategy,
      nodes: branchNodes(observation),
    },
  }
}

function copyWorkflow(workflow: typeof WORKFLOW_REFERENCES[number]) {
  return {
    ...workflow,
    aliases: [...workflow.aliases],
    preconditions: [...workflow.preconditions],
    localEffects: [...workflow.localEffects],
    remoteEffects: [...workflow.remoteEffects],
    nonEffects: [...workflow.nonEffects],
    relatedWorkflows: [...workflow.relatedWorkflows],
    guardrailIds: [...workflow.guardrailIds],
  }
}

function activeGuardrailIds(
  observation: RepositoryObservation,
): Set<string> {
  const active = new Set<string>()
  if (observation.operations.length > 0) active.add('git.operation.active')
  if (observation.head.detached) active.add('git.head.detached')
  const tracking = observation.localTracking.state
  if (tracking === 'diverged') active.add('git.branch.diverged')
  if (!observation.workingTree.clean && tracking === 'behind') {
    active.add('git.working-tree.dirty-behind')
  } else if (!observation.workingTree.clean) {
    active.add('git.working-tree.dirty')
  }
  if (tracking === 'behind') active.add('git.branch.behind')
  if (tracking === 'unpublished') active.add('git.branch.unpublished')
  if (tracking === 'ahead') active.add('git.branch.ahead')
  return active
}

function currentRole(
  observation: RepositoryObservation,
): BranchWorkflowNode['role'] | 'other' {
  const branch = observation.head.branch
  const model = observation.tctbp.branchModel
  if (branch === model.productionBranch) return 'production'
  if (branch === model.preProductionBranch) return 'pre-production'
  if (branch === model.workingBranch) return 'working'
  return 'other'
}

function workflowApplies(
  workflowId: string,
  role: ReturnType<typeof currentRole>,
): boolean {
  if (workflowId === 'promote') {
    return role === 'working' || role === 'pre-production'
  }
  if (workflowId === 'ship') return role === 'production'
  if (workflowId === 'deploy') return role !== 'other'
  return true
}

function branchNodes(
  observation: RepositoryObservation,
): BranchWorkflowNode[] {
  const model = observation.tctbp.branchModel
  if (
    model.workingBranch
    && model.workingBranch === model.productionBranch
    && !model.preProductionBranch
  ) {
    return [{
      role: 'production',
      branch: model.productionBranch,
      promoteTrigger: null,
      deployTrigger: 'deploy production please',
    }]
  }
  const nodes: BranchWorkflowNode[] = []
  if (model.workingBranch) {
    nodes.push({
      role: 'working',
      branch: model.workingBranch,
      promoteTrigger: model.preProductionBranch
        ? `promote ${model.preProductionBranch} please`
        : null,
      deployTrigger: 'deploy dev please',
    })
  }
  if (model.preProductionBranch) {
    nodes.push({
      role: 'pre-production',
      branch: model.preProductionBranch,
      promoteTrigger: model.productionBranch
        ? 'promote production please'
        : null,
      deployTrigger: 'deploy staging please',
    })
  }
  if (model.productionBranch) {
    nodes.push({
      role: 'production',
      branch: model.productionBranch,
      promoteTrigger: null,
      deployTrigger: 'deploy production please',
    })
  }
  return nodes
}
