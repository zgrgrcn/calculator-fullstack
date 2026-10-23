import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HISTORY_LIMIT,
  HISTORY_STORAGE_KEY,
  mergeHistory,
  readHistory,
  writeHistory,
} from './history'
import type { HistoryEntry } from './history'

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

  it('reports whether the entries were stored', () => {
    expect(writeHistory([])).toBe(true)
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
    expect(writeHistory([])).toBe(false)
    setItem.mockRestore()
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

describe('mergeHistory', () => {
  const entry = (at: number, expression = `${at} + 0`): HistoryEntry => ({
    expression,
    result: String(at),
    value: at,
    at,
  })

  it('unites lists newest first and keeps a shared entry once', () => {
    const shared = entry(2)
    expect(
      mergeHistory([entry(3), shared], [shared, entry(1)], [entry(4)]),
    ).toEqual([entry(4), entry(3), shared, entry(1)])
  })

  it('tells apart different calculations made at the same moment', () => {
    expect(mergeHistory([entry(5, '2 + 3')], [entry(5, '1 + 4')])).toHaveLength(
      2,
    )
  })

  it('keeps only the newest HISTORY_LIMIT entries', () => {
    const older = Array.from({ length: HISTORY_LIMIT }, (_, i) => entry(i))
    const merged = mergeHistory([entry(1000)], older)
    expect(merged).toHaveLength(HISTORY_LIMIT)
    expect(merged[0]).toEqual(entry(1000))
    expect(merged[merged.length - 1]).toEqual(entry(1))
  })
})
