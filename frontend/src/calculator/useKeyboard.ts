import { useEffect } from 'react'
import type { Digit, Key } from './types'

const DIGITS: Record<string, Key> = Object.fromEntries(
  ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => [
    d,
    { type: 'digit', value: d as Digit },
  ]),
)

const KEYMAP: Record<string, Key> = {
  ...DIGITS,
  '.': { type: 'decimal' },
  '+': { type: 'operator', op: 'add' },
  '-': { type: 'operator', op: 'subtract' },
  '*': { type: 'operator', op: 'multiply' },
  '/': { type: 'operator', op: 'divide' },
  '^': { type: 'operator', op: 'power' },
  '%': { type: 'unary', op: 'percentage' },
  s: { type: 'unary', op: 'sqrt' },
  Enter: { type: 'equals' },
  '=': { type: 'equals' },
  Escape: { type: 'clear' },
  Backspace: { type: 'backspace' },
}

/**
 * Maps physical keys to calculator keys. Browser shortcuts (with Ctrl, Meta
 * or Alt) are left alone, and so is Enter on a focused button or link outside
 * the keypad: there it is that control's own activation, the same as Space,
 * not equals. On a keypad key, or with nothing focused, Enter still evaluates.
 */
export function useKeyboard(press: (key: Key) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'Enter' && activatesFocusedControl(event.target)) return
      const key = KEYMAP[event.key]
      if (!key) return
      event.preventDefault()
      press(key)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [press, enabled])
}

/** True when Enter would activate the focused control: a button or link that is not a keypad key. */
function activatesFocusedControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return (
    target.closest('button, a, [role="button"]') !== null &&
    target.closest('.keypad') === null
  )
}
