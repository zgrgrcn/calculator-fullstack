import { beforeEach, describe, expect, it } from 'vitest'
import {
  HISTORY_LIMIT,
  HISTORY_STORAGE_KEY,
  readHistory,
  writeHistory,
} from './history'

describe('history storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips entries and keeps only the newest HISTORY_LIMIT', () => {
    const entries = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => ({
      expression: `${i} + 1`,
      result: String(i + 1),
      value: i + 1,
      at: i,
    }))
    writeHistory(entries)
    const read = readHistory()
    expect(read).toHaveLength(HISTORY_LIMIT)
    expect(read[0]).toEqual(entries[0])
  })

  it('returns an empty list for missing, corrupt or malformed storage', () => {
    expect(readHistory()).toEqual([])
    localStorage.setItem(HISTORY_STORAGE_KEY, 'not json')
    expect(readHistory()).toEqual([])
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([
        { expression: '1 + 1', result: '2', at: 1 },
        { nope: true },
        'x',
      ]),
    )
    expect(readHistory()).toEqual([
      { expression: '1 + 1', result: '2', value: 2, at: 1 },
    ])
  })
})
