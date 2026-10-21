import { useCallback, useEffect, useReducer, useRef } from 'react'
import { ApiError, NetworkError, evaluate, isAbortError } from '../api/client'
import {
  formatExpression,
  isComplete,
  mainText,
  secondaryText,
  toApiTokens,
} from './expression'
import { formatNumber } from './format'
import { initialState, reduce } from './reducer'
import type { Key } from './types'

export interface FinishedEvaluation {
  /** The expression as shown, without the closing equals. */
  expression: string
  /** The result as shown. */
  result: string
  /** The exact result, for continuing from it later. */
  value: number
}

interface Options {
  client?: typeof evaluate
  /** Called once per answered evaluation, after the result is accepted. */
  onResult?: (finished: FinishedEvaluation) => void
}

/**
 * Owns the calculator state and sends the one request the reducer places
 * on equals. This is the only place the frontend reaches the network for
 * arithmetic.
 */
export function useCalculator({ client = evaluate, onResult }: Options = {}) {
  const [state, dispatch] = useReducer(reduce, 1, initialState)
  const { request } = state

  // Read through a ref so a new callback identity never restarts a request.
  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    if (!request) return
    const controller = new AbortController()
    client(toApiTokens(request.tokens), { signal: controller.signal }).then(
      (value) => {
        dispatch({ type: 'resolved', id: request.id, value })
        onResultRef.current?.({
          expression: formatExpression({ tokens: request.tokens, entry: null }),
          result: formatNumber(value),
          value,
        })
      },
      (err: unknown) => {
        if (!isAbortError(err))
          dispatch({ type: 'failed', id: request.id, message: toMessage(err) })
      },
    )
    return () => controller.abort()
  }, [request, client])

  const press = useCallback((key: Key) => dispatch({ type: 'key', key }), [])
  const insert = useCallback(
    (value: number) => dispatch({ type: 'insert', value }),
    [],
  )

  return {
    display: mainText(state),
    expression: secondaryText(state),
    complete: isComplete(state.tokens),
    status: state.status,
    press,
    insert,
  }
}

export function toMessage(err: unknown): string {
  if (err instanceof ApiError)
    return err.message.charAt(0).toUpperCase() + err.message.slice(1)
  if (err instanceof NetworkError) return err.message
  return 'Something went wrong'
}
