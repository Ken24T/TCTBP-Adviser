export interface HandoverEvidence {
  repositoryId: string
  branch: string
  commitSha: string
  completedAt: string
  workflow: 'handover'
  workflowCompleted: true
  summary: string
}
