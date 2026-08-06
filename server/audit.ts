import { randomUUID } from 'node:crypto'
import type { InspectionAuditEntry } from '../shared/diagnostics'
import { errorCode } from './errors'

export class InspectionAuditLog {
  readonly #entries: InspectionAuditEntry[] = []

  constructor(
    readonly capacity = 200,
    readonly now: () => Date = () => new Date(),
    readonly createId: () => string = randomUUID,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1_000) {
      throw new RangeError('Audit capacity must be between 1 and 1,000.')
    }
  }

  async capture<T>(
    repositoryId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const started = this.now()
    try {
      const result = await operation()
      this.record(repositoryId, started, this.now(), 'success', null)
      return result
    } catch (error) {
      this.record(
        repositoryId,
        started,
        this.now(),
        'failure',
        errorCode(error),
      )
      throw error
    }
  }

  list(): InspectionAuditEntry[] {
    return this.#entries.map((entry) => ({ ...entry }))
  }

  private record(
    repositoryId: string,
    started: Date,
    completed: Date,
    outcome: InspectionAuditEntry['outcome'],
    failureCode: string | null,
  ): void {
    this.#entries.unshift({
      id: this.createId(),
      repositoryId,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      durationMs: Math.max(0, completed.getTime() - started.getTime()),
      outcome,
      errorCode: failureCode,
    })
    if (this.#entries.length > this.capacity) {
      this.#entries.length = this.capacity
    }
  }
}
