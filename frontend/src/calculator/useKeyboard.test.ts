import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { Key } from './types'
import { useKeyboard } from './useKeyboard'

function keydown(
  target: Element | Window,
  key: string,
  init: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

describe('useKeyboard', () => {
  let press: Mock<(key: Key) => void>
  let swatch: HTMLButtonElement
  let keypadKey: HTMLButtonElement
  let link: HTMLAnchorElement

  beforeEach(() => {
    press = vi.fn<(key: Key) => void>()
    document.body.innerHTML =
      '<button id="swatch">Netflix</button>' +
      '<a id="link" href="#">Source</a>' +
      '<div class="keypad"><button id="seven" class="key">7</button></div>'
    swatch = document.getElementById('swatch') as HTMLButtonElement
    link = document.getElementById('link') as HTMLAnchorElement
    keypadKey = document.getElementById('seven') as HTMLButtonElement
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('maps keys to calculator keys and swallows their default action', () => {
    renderHook(() => useKeyboard(press))
    expect(keydown(window, '7').defaultPrevented).toBe(true)
    expect(keydown(window, '+').defaultPrevented).toBe(true)
    expect(keydown(window, 'Enter').defaultPrevented).toBe(true)
    expect(press.mock.calls.map(([key]) => key)).toEqual([
      { type: 'digit', value: '7' },
      { type: 'operator', op: 'add' },
      { type: 'equals' },
    ])
  })

  it('leaves Enter to a focused button or link outside the keypad', () => {
    renderHook(() => useKeyboard(press))
    swatch.focus()
    expect(keydown(swatch, 'Enter').defaultPrevented).toBe(false)
    link.focus()
    expect(keydown(link, 'Enter').defaultPrevented).toBe(false)
    expect(press).not.toHaveBeenCalled()
  })

  it('still evaluates on Enter from a keypad key', () => {
    renderHook(() => useKeyboard(press))
    keypadKey.focus()
    expect(keydown(keypadKey, 'Enter').defaultPrevented).toBe(true)
    expect(press).toHaveBeenCalledWith({ type: 'equals' })
  })

  it('still types digits while a control outside the keypad has focus', () => {
    renderHook(() => useKeyboard(press))
    swatch.focus()
    expect(keydown(swatch, '2').defaultPrevented).toBe(true)
    expect(press).toHaveBeenCalledWith({ type: 'digit', value: '2' })
  })

  it('ignores browser shortcuts and unmapped keys', () => {
    renderHook(() => useKeyboard(press))
    expect(keydown(window, '7', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(keydown(window, 'a').defaultPrevented).toBe(false)
    expect(press).not.toHaveBeenCalled()
  })

  it('does nothing while disabled, and stops listening on unmount', () => {
    const { unmount } = renderHook(() => useKeyboard(press, false))
    keydown(window, '7')
    expect(press).not.toHaveBeenCalled()
    unmount()
    const live = renderHook(() => useKeyboard(press))
    live.unmount()
    keydown(window, '7')
    expect(press).not.toHaveBeenCalled()
  })
})
