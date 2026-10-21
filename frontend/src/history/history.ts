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

export function writeHistory(entries: readonly HistoryEntry[]): void {
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, HISTORY_LIMIT)),
    )
  } catch {
    // Storage unavailable (private mode, blocked, full): history lasts for this page only.
  }
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
