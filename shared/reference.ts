import type { RecommendationReasonCode } from './recommendation'

export type CoreWorkflowId =
  | 'status'
  | 'abort'
  | 'resume'
  | 'checkpoint'
  | 'publish'
  | 'handover'
  | 'branch'
  | 'promote'
  | 'deploy'
  | 'ship'

export interface WorkflowReference {
  id: CoreWorkflowId
  displayName: string
  category: 'inspection' | 'preservation' | 'continuation' | 'environment'
  purpose: string
  aliases: string[]
  runner: string
  dryRun: boolean
  branchRestriction: string
  preconditions: string[]
  localEffects: string[]
  remoteEffects: string[]
  nonEffects: string[]
  relatedWorkflows: CoreWorkflowId[]
  guardrailIds: string[]
}

export interface GuardrailReference {
  id: string
  reasonCode: RecommendationReasonCode
  title: string
  meaning: string
  blocks: CoreWorkflowId[]
  safeResponse: string
}

export interface ReferenceCatalogue {
  contract: {
    name: 'tctbp-adviser-inspection'
    major: 1
    capability: 'workflow-catalogue.core-v1'
    sourceRevision: string
  }
  workflows: WorkflowReference[]
  guardrails: GuardrailReference[]
}

export interface RepositoryWorkflowReference extends WorkflowReference {
  advertised: boolean
  applicableToCurrentBranch: boolean
}

export interface RepositoryGuardrailReference extends GuardrailReference {
  active: boolean
}

export interface BranchWorkflowNode {
  role: 'working' | 'pre-production' | 'production'
  branch: string
  promoteTrigger: string | null
  deployTrigger: string
}

export interface RepositoryReference {
  workflows: RepositoryWorkflowReference[]
  guardrails: RepositoryGuardrailReference[]
  branchWorkflow: {
    strategy: string | null
    nodes: BranchWorkflowNode[]
  }
}
