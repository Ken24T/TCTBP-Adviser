import {
  INSPECTION_BASIS,
  type RepositoryObservation,
} from '../shared/inspection'
import type { RegisteredRepository } from './registry'
import type { LocalGitInspector } from './local-git'
import type { InspectionAuditLog } from './audit'
import { inspectTctbp } from './tctbp'

export class RepositoryInspectionService {
  constructor(
    readonly gitInspector: LocalGitInspector,
    readonly audit: InspectionAuditLog | null = null,
  ) {}

  async inspect(
    repository: RegisteredRepository,
  ): Promise<RepositoryObservation> {
    const operation = () => this.inspectRepository(repository)
    return this.audit
      ? this.audit.capture(repository.id, operation)
      : operation()
  }

  private async inspectRepository(
    repository: RegisteredRepository,
  ): Promise<RepositoryObservation> {
    const [git, tctbp] = await Promise.all([
      this.gitInspector.inspect(repository.path),
      inspectTctbp(repository.path),
    ])
    const counts = git.counts

    return {
      repository: {
        id: repository.id,
        name: tctbp.projectName ?? repository.name,
      },
      observedAt: new Date().toISOString(),
      basis: INSPECTION_BASIS,
      fetchPerformed: false,
      head: {
        branch: git.branch,
        detached: git.detached,
        unborn: git.unborn,
        sha: git.sha,
      },
      workingTree: {
        clean: git.pathCount === 0,
        pathCount: git.pathCount,
        counts,
      },
      operations: git.operations,
      localTracking: git.tracking,
      remoteOrigin: git.remoteOrigin,
      tctbp,
      errors: [...tctbp.errors],
    }
  }
}
