import { useCallback, useEffect, useState } from 'react'
import { isAbortError, operations } from '../api/client'
import type { OperationName } from '../api/types'

type Result = { supported: ReadonlySet<OperationName> } | { error: true } | null
export type OperationsStatus = 'loading' | 'ready' | 'error'

/**
 * Asks the backend which operations it supports, once on mount. The keypad
 * only enables what the backend advertises, and the call doubles as a
 * startup connectivity check.
 */
export function useOperations(client: typeof operations = operations) {
  const [result, setResult] = useState<Result>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    client({ signal: controller.signal }).then(
      (specs) =>
        setResult({ supported: new Set(specs.map((spec) => spec.name)) }),
      (err: unknown) => {
        // StrictMode aborts the first mount call; that is not a failure.
        if (!isAbortError(err)) setResult({ error: true })
      },
    )
    return () => controller.abort()
  }, [client, attempt])

  const reload = useCallback(() => {
    setResult(null)
    setAttempt((n) => n + 1)
  }, [])

  const status: OperationsStatus =
    result === null ? 'loading' : 'error' in result ? 'error' : 'ready'
  const supported =
    result !== null && 'supported' in result ? result.supported : null
  return { status, supported, reload }
}
