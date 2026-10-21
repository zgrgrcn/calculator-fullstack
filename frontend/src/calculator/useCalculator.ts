import { useCallback, useEffect, useReducer } from 'react'
import { ApiError, NetworkError, evaluate, isAbortError } from '../api/client'
import { isComplete, mainText, secondaryText, toApiTokens } from './expression'
import { initialState, reduce } from './reducer'
import type { Key } from './types'

/**
 * Owns the calculator state and sends the one request the reducer places
 * on equals. This is the only place the frontend reaches the network for
 * arithmetic.
 */
export function useCalculator(client: typeof evaluate = evaluate) {
  const [state, dispatch] = useReducer(reduce, 1, initialState)
  const { request } = state

  useEffect(() => {
    if (!request) return
    const controller = new AbortController()
    client(toApiTokens(request.tokens), { signal: controller.signal }).then(
      (value) => dispatch({ type: 'resolved', id: request.id, value }),
      (err: unknown) => {
        if (!isAbortError(err))
          dispatch({ type: 'failed', id: request.id, message: toMessage(err) })
      },
    )
    return () => controller.abort()
  }, [request, client])

  const press = useCallback((key: Key) => dispatch({ type: 'key', key }), [])

  return {
    display: mainText(state),
    expression: secondaryText(state),
    complete: isComplete(state.tokens),
    status: state.status,
    press,
  }
}

export function toMessage(err: unknown): string {
  if (err instanceof ApiError)
    return err.message.charAt(0).toUpperCase() + err.message.slice(1)
  if (err instanceof NetworkError) return err.message
  return 'Something went wrong'
}
