import type { RecommendationEvidence } from './recommendation'
import type { RecommendationIntent } from './recommendation'

export type IntentWorkflowId =
  | 'status'
  | 'checkpoint'
  | 'publish'
  | 'handover'
  | 'resume'
  | 'promote'
  | 'deploy'
  | 'ship'
  | 'abort'
  | 'inspect-recovery'

export interface IntentPlanStep {
  id: string
  workflowId: IntentWorkflowId
  label: string
  trigger: string | null
  kind: 'inspection' | 'workflow' | 'guidance'
  condition: 'satisfied' | 'required' | 'conditional'
  targetBranch: string | null
  explanation: string
}

export interface IntentPlanBlock {
  code: string
  message: string
}

export interface IntentPlan {
  source: 'user-intent'
  intent: Exclude<RecommendationIntent, 'none'>
  status: 'ready' | 'blocked' | 'complete'
  title: string
  summary: string
  steps: IntentPlanStep[]
  likelyNextStepId: string | null
  blockedBy: IntentPlanBlock[]
  evidence: RecommendationEvidence[]
  branchStrategy: string | null
  effects: {
    does: string[]
    doesNot: string[]
  }
}
