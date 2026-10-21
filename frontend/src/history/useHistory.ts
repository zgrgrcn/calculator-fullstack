import { useCallback, useEffect, useState } from 'react'
import { HISTORY_LIMIT, readHistory, writeHistory } from './history'
import type { HistoryEntry } from './history'

/** Finished evaluations, newest first, kept in localStorage. */
export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(readHistory)

  useEffect(() => {
    writeHistory(entries)
  }, [entries])

  const add = useCallback((entry: Omit<HistoryEntry, 'at'>) => {
    setEntries((previous) =>
      [{ ...entry, at: Date.now() }, ...previous].slice(0, HISTORY_LIMIT),
    )
  }, [])

  const clear = useCallback(() => {
    setEntries([])
  }, [])

  return { entries, add, clear }
}
