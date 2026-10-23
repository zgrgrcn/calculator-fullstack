export interface HistoryEntry {
  /** The evaluated expression without its closing equals, for example "2 + 3 × 4". */
  expression: string
  /** The formatted result, for example "14". */
  result: string
  /** The exact result, so a chosen entry continues with full precision. */
  value: number
  /** Epoch milliseconds, newest first in storage. */
  at: number
}

export const HISTORY_STORAGE_KEY = 'calculator.history'
export const HISTORY_LIMIT = 50

/** The stored history, newest first; empty when storage is missing, corrupt or unavailable. */
export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter(isStoredEntry).map(withValue).slice(0, HISTORY_LIMIT)
      : []
  } catch {
    return []
  }
}

/** True once stored; false when storage is unavailable (private mode, blocked, full). */
export function writeHistory(entries: readonly HistoryEntry[]): boolean {
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, HISTORY_LIMIT)),
    )
    return true
  } catch {
    return false
  }
}

/**
 * The union of several lists, newest first and capped, with an entry that
 * appears in more than one list kept once. A tab merges what it is about to
 * save with what the other tabs saved, so a write never drops their entries.
 */
export function mergeHistory(
  ...lists: readonly (readonly HistoryEntry[])[]
): HistoryEntry[] {
  const seen = new Set<string>()
  const merged: HistoryEntry[] = []
  for (const entry of lists.flat()) {
    const id = `${entry.at}\u0000${entry.expression}\u0000${entry.result}`
    if (seen.has(id)) continue
    seen.add(id)
    merged.push(entry)
  }
  return merged.sort((a, b) => b.at - a.at).slice(0, HISTORY_LIMIT)
}

/**
 * Calls `listener` with the stored history whenever another tab changes it:
 * the browser fires `storage` in every tab except the one that wrote, with a
 * null key when the whole storage was cleared. Returns a function that
 * stops listening.
 */
export function subscribeHistory(
  listener: (entries: HistoryEntry[]) => void,
): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === HISTORY_STORAGE_KEY)
      listener(readHistory())
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}

type StoredEntry = Omit<HistoryEntry, 'value'> & { value?: unknown }

function isStoredEntry(value: unknown): value is StoredEntry {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.expression === 'string' &&
    typeof record.result === 'string' &&
    typeof record.at === 'number'
  )
}

// Entries written before the value was stored get it back from the text.
function withValue(entry: StoredEntry): HistoryEntry {
  return {
    ...entry,
    value: typeof entry.value === 'number' ? entry.value : Number(entry.result),
  }
}
