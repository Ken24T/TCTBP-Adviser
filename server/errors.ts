export class AdviserError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AdviserError'
    this.code = code
  }
}

export function errorCode(error: unknown): string {
  return error instanceof AdviserError ? error.code : 'inspection-failed'
}
