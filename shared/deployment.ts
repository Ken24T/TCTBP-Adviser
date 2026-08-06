export interface DeploymentEvidence {
  repositoryId: string
  environment: 'development' | 'review' | 'production'
  branch: string
  commitSha: string
  completedAt: string
  workflow: 'deploy-development'
  workflowCompleted: true
  runtimeVerification: 'verified' | 'not-configured' | 'not-verified'
  summary: string
}
