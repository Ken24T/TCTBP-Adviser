/** Shared same-origin fetch core for the Adviser API surface. */

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
  })
  const body = await response.json() as unknown
  if (!response.ok) {
    throw new Error(apiErrorMessage(body, response.status))
  }
  return body as T
}

function apiErrorMessage(body: unknown, status: number): string {
  if (
    typeof body === 'object'
    && body !== null
    && 'error' in body
    && typeof body.error === 'object'
    && body.error !== null
    && 'message' in body.error
    && typeof body.error.message === 'string'
  ) {
    return body.error.message
  }
  return `The local Adviser service returned HTTP ${status}.`
}
