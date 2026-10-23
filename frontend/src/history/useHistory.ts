import { useCallback, useEffect, useState } from 'react'
import {
  mergeHistory,
  readHistory,
  subscribeHistory,
  writeHistory,
} from './history'
import type { HistoryEntry } from './history'

/**
 * Finished evaluations, newest first, kept in localStorage and shared with
 * the other tabs: a write merges the new entry into what is stored at that
 * moment, so nothing another tab saved is dropped, and their writes arrive
 * through the storage event. Without storage the list lasts for this page
 * only.
 */
export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(readHistory)

  useEffect(() => subscribeHistory(setEntries), [])

  const add = useCallback((entry: Omit<HistoryEntry, 'at'>) => {
    const stamped = { ...entry, at: Date.now() }
    // Storage, not this tab's list, is the truth: a clear in another tab stays cleared.
    const merged = mergeHistory([stamped], readHistory())
    if (writeHistory(merged)) setEntries(merged)
    else setEntries((previous) => mergeHistory([stamped], previous))
  }, [])

  const clear = useCallback(() => {
    writeHistory([])
    setEntries([])
  }, [])

  return { entries, add, clear }
}
