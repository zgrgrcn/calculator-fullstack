import type { ApiToken, OperationSpec } from './types'

/** The backend answered with an error body (or a non-2xx status). */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** The request never reached the backend. */
export class NetworkError extends Error {
  constructor(message = 'Backend unreachable') {
    super(message)
    this.name = 'NetworkError'
  }
}

export interface RequestOptions {
  signal?: AbortSignal
  /** Origin of the API; empty (same origin) in both dev and prod, where a proxy forwards /api. */
  baseUrl?: string
}

/** Evaluates a whole expression in one request; the backend applies precedence. */
export async function evaluate(
  tokens: readonly ApiToken[],
  options: RequestOptions = {},
): Promise<number> {
  const body = await send(`${options.baseUrl ?? ''}/api/v1/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokens }),
    signal: options.signal,
  })
  const result = isRecord(body) ? body.result : undefined
  if (typeof result !== 'number')
    throw new ApiError('INVALID_RESPONSE', 'Backend returned no result', 200)
  return result
}

export async function operations(
  options: RequestOptions = {},
): Promise<OperationSpec[]> {
  const body = await send(`${options.baseUrl ?? ''}/api/v1/operations`, {
    signal: options.signal,
  })
  const list = isRecord(body) ? body.operations : undefined
  if (!Array.isArray(list))
    throw new ApiError(
      'INVALID_RESPONSE',
      'Backend returned no operations',
      200,
    )
  return list as OperationSpec[]
}

async function send(url: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (err) {
    if (isAbortError(err)) throw err
    throw new NetworkError()
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : {}
    throw new ApiError(
      typeof error.code === 'string' ? error.code : 'UNKNOWN',
      typeof error.message === 'string'
        ? error.message
        : `HTTP ${response.status}`,
      response.status,
    )
  }
  return body
}

// Checked by name only: an AbortError can come from another realm (jsdom,
// Node), where neither `instanceof DOMException` nor `instanceof Error` holds.
export function isAbortError(err: unknown): boolean {
  return isRecord(err) && err.name === 'AbortError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
