import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  NetworkError,
  evaluate,
  isAbortError,
  operations,
} from './client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const TOKENS = [
  { type: 'number', value: 2 },
  { type: 'operator', op: 'add' },
  { type: 'number', value: 3 },
] as const

describe('evaluate', () => {
  it('posts the token list and resolves the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: 5 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(evaluate(TOKENS)).resolves.toBe(5)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/evaluate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: TOKENS }),
      }),
    )
  })

  it('prefixes baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    await evaluate(TOKENS, { baseUrl: 'http://api.test' })
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/v1/evaluate')
  })

  it('rejects with ApiError carrying the backend code and message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'DIVISION_BY_ZERO',
              message: 'cannot divide by zero',
            },
          },
          422,
        ),
      ),
    )
    const err: unknown = await evaluate(TOKENS).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      code: 'DIVISION_BY_ZERO',
      message: 'cannot divide by zero',
      status: 422,
    })
  })

  it('rejects with ApiError UNKNOWN when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 500 })),
    )
    await expect(evaluate(TOKENS)).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'HTTP 500',
      status: 500,
    })
  })

  it('rejects with NetworkError when fetch itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    const err: unknown = await evaluate(TOKENS).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NetworkError)
    expect((err as Error).message).toBe('Backend unreachable')
  })

  it('rejects with INVALID_RESPONSE when the result is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    await expect(evaluate(TOKENS)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('passes an abort through untouched', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
    await expect(
      evaluate(TOKENS, { signal: new AbortController().signal }),
    ).rejects.toBe(abort)
  })
})

describe('operations', () => {
  it('resolves the list', async () => {
    const list = [{ name: 'add', arity: 2, symbol: '+' }]
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ operations: list }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(operations()).resolves.toEqual(list)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/operations')
  })

  it('rejects with INVALID_RESPONSE when operations is not an array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ operations: 'nope' })),
    )
    await expect(operations()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})

describe('isAbortError', () => {
  it('matches by name, not by class', () => {
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true)
    const realmless = new Error('x')
    realmless.name = 'AbortError'
    expect(isAbortError(realmless)).toBe(true)
    expect(isAbortError(new TypeError('x'))).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
  })
})
