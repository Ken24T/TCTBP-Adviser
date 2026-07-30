import { createHmac, randomBytes } from 'node:crypto'
import type { RepositorySummary } from '../shared/inspection'
import type { ServiceConfig } from './config'
import { AdviserError } from './errors'

export interface RegisteredRepository extends RepositorySummary {
  path: string
}

export class RepositoryRegistry {
  readonly #repository: RegisteredRepository

  constructor(config: ServiceConfig, secret = randomBytes(32)) {
    const id = createHmac('sha256', secret)
      .update(config.repositoryPath)
      .digest('base64url')
      .slice(0, 24)

    this.#repository = {
      id,
      name: config.repositoryName,
      path: config.repositoryPath,
    }
  }

  list(): RepositorySummary[] {
    return [{
      id: this.#repository.id,
      name: this.#repository.name,
    }]
  }

  require(id: string): RegisteredRepository {
    if (id !== this.#repository.id) {
      throw new AdviserError(
        'repository-not-found',
        'The requested repository is not registered.',
      )
    }
    return this.#repository
  }
}
