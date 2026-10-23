import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_LIMIT, HISTORY_STORAGE_KEY, readHistory } from './history'
import { useHistory } from './useHistory'

const entry = (expression: string, value: number) => ({
  expression,
  result: String(value),
  value,
})
const expressions = (entries: readonly { expression: string }[]) =>
  entries.map((e) => e.expression)

/** One tab: a mounted hook. Both tabs share jsdom's single localStorage. */
const openTab = () => renderHook(() => useHistory())

/**
 * jsdom has one window, so the storage event the browser would fire in the
 * other tabs after a write is delivered by hand.
 */
function notifyOtherTabs(key: string | null = HISTORY_STORAGE_KEY) {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key,
      newValue: key === null ? null : localStorage.getItem(key),
      storageArea: localStorage,
    }),
  )
}

describe('useHistory across tabs', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps what another tab saved when it writes', () => {
    const a = openTab()
    const b = openTab()
    act(() => a.result.current.add(entry('1 + 1', 2)))
    vi.setSystemTime(2_000)
    act(() => b.result.current.add(entry('2 + 2', 4)))
    expect(expressions(readHistory())).toEqual(['2 + 2', '1 + 1'])
    expect(expressions(b.result.current.entries)).toEqual(['2 + 2', '1 + 1'])
  })

  it('shows what another tab wrote once the browser reports it', () => {
    const a = openTab()
    const b = openTab()
    act(() => a.result.current.add(entry('1 + 1', 2)))
    expect(b.result.current.entries).toEqual([])
    act(() => notifyOtherTabs())
    expect(expressions(b.result.current.entries)).toEqual(['1 + 1'])
  })

  it('a clear in one tab empties the others and their next write keeps it cleared', () => {
    const a = openTab()
    const b = openTab()
    act(() => a.result.current.add(entry('1 + 1', 2)))
    act(() => notifyOtherTabs())
    act(() => b.result.current.clear())
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe('[]')
    act(() => notifyOtherTabs())
    expect(a.result.current.entries).toEqual([])
    vi.setSystemTime(3_000)
    act(() => a.result.current.add(entry('3 + 3', 6)))
    expect(expressions(readHistory())).toEqual(['3 + 3'])
  })

  it('orders writes from several tabs newest first and keeps the newest HISTORY_LIMIT', () => {
    const a = openTab()
    const b = openTab()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      vi.setSystemTime(10_000 + i)
      act(() => (i % 2 ? a : b).result.current.add(entry(`${i} + 0`, i)))
    }
    const stored = readHistory()
    expect(stored).toHaveLength(HISTORY_LIMIT)
    expect(stored[0].expression).toBe(`${HISTORY_LIMIT + 4} + 0`)
    const times = stored.map((e) => e.at)
    expect(times).toEqual([...times].sort((x, y) => y - x))
  })

  it('reacts to its own key and to a wholesale clear, not to other keys', () => {
    const a = openTab()
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([{ expression: '9 + 9', result: '18', value: 18, at: 5 }]),
    )
    act(() => notifyOtherTabs('calculator.theme'))
    expect(a.result.current.entries).toEqual([])
    act(() => notifyOtherTabs(null))
    expect(expressions(a.result.current.entries)).toEqual(['9 + 9'])
  })

  it('keeps the list for this page when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const a = openTab()
    act(() => a.result.current.add(entry('1 + 1', 2)))
    vi.setSystemTime(2_000)
    act(() => a.result.current.add(entry('2 + 2', 4)))
    expect(expressions(a.result.current.entries)).toEqual(['2 + 2', '1 + 1'])
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull()
  })

  it('stops listening when the tab closes', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    openTab().unmount()
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function))
  })
})
