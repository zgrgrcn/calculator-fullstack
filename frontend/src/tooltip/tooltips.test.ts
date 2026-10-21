import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTooltips, TOOLTIP_DELAY_MS } from './tooltips'

function pointer(type: string, target: Element, init: PointerEventInit = {}) {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, pointerType: 'mouse', ...init }),
  )
}

function key(type: 'keydown' | 'keyup', name: string, target: EventTarget) {
  target.dispatchEvent(new KeyboardEvent(type, { key: name, bubbles: true }))
}

const isOpen = (element: Element) => element.hasAttribute('data-tooltip-open')

describe('installTooltips', () => {
  let first: HTMLButtonElement
  let icon: Element
  let second: HTMLButtonElement
  let plain: HTMLButtonElement
  let uninstall: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<button id="first" data-tooltip="First"><svg></svg></button>' +
      '<button id="second" data-tooltip="Second"></button>' +
      '<button id="plain">plain</button>'
    first = document.getElementById('first') as HTMLButtonElement
    icon = first.firstElementChild as Element
    second = document.getElementById('second') as HTMLButtonElement
    plain = document.getElementById('plain') as HTMLButtonElement
    uninstall = installTooltips(document)
  })

  afterEach(() => {
    uninstall()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('opens after the delay while a mouse rests on a control, and closes when it leaves', () => {
    pointer('pointerover', first)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1)
    expect(isOpen(first)).toBe(false)
    vi.advanceTimersByTime(1)
    expect(isOpen(first)).toBe(true)
    pointer('pointerout', first, { relatedTarget: document.body })
    expect(isOpen(first)).toBe(false)
  })

  it('does not open when the pointer leaves before the delay', () => {
    pointer('pointerover', first)
    pointer('pointerout', first, { relatedTarget: document.body })
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(first)).toBe(false)
  })

  it('stays open while the pointer moves between parts of the same control', () => {
    pointer('pointerover', first)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    pointer('pointerout', first, { relatedTarget: icon })
    pointer('pointerover', icon, { relatedTarget: first })
    expect(isOpen(first)).toBe(true)
  })

  it('never opens for a touch, even when the browser focuses the tapped control', () => {
    pointer('pointerover', first, { pointerType: 'touch' })
    pointer('pointerdown', first, { pointerType: 'touch' })
    first.focus()
    pointer('pointerup', first, { pointerType: 'touch' })
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS * 2)
    expect(document.querySelector('[data-tooltip-open]')).toBeNull()
  })

  it('closes on press and stays closed until the pointer leaves and returns', () => {
    pointer('pointerover', first)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    pointer('pointerdown', first)
    expect(isOpen(first)).toBe(false)
    pointer('pointerup', first)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(first)).toBe(false)
    pointer('pointerout', first, { relatedTarget: document.body })
    pointer('pointerover', first, { relatedTarget: document.body })
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(first)).toBe(true)
  })

  it('shows one tooltip at a time', () => {
    pointer('pointerover', first)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    pointer('pointerout', first, { relatedTarget: second })
    pointer('pointerover', second, { relatedTarget: first })
    expect(isOpen(first)).toBe(false)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(second)).toBe(true)
    expect(document.querySelectorAll('[data-tooltip-open]')).toHaveLength(1)
  })

  it('opens on keyboard focus and closes when focus moves on', () => {
    key('keydown', 'Tab', document)
    first.focus()
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(first)).toBe(true)
    plain.focus()
    expect(isOpen(first)).toBe(false)
  })

  it('does not open for focus that follows a pointer press', () => {
    pointer('pointerdown', first)
    first.focus()
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(first)).toBe(false)
  })

  it('closes when the control is activated from the keyboard', () => {
    key('keydown', 'Tab', document)
    first.focus()
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(first)).toBe(true)
    key('keyup', ' ', first)
    expect(isOpen(first)).toBe(false)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(first)).toBe(false)
  })

  it('closes on Escape', () => {
    key('keydown', 'Tab', document)
    second.focus()
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(second)).toBe(true)
    key('keydown', 'Escape', second)
    expect(isOpen(second)).toBe(false)
  })

  it('keeps an open tooltip when its control also takes keyboard focus', () => {
    key('keydown', 'Tab', document)
    pointer('pointerover', first)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    first.focus()
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(first)).toBe(true)
    expect(document.querySelectorAll('[data-tooltip-open]')).toHaveLength(1)
  })

  it('does not restart the delay when focus joins a pending hover', () => {
    key('keydown', 'Tab', document)
    pointer('pointerover', first)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS / 2)
    first.focus()
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS / 2)
    expect(isOpen(first)).toBe(true)
  })

  it('closes on Enter release too', () => {
    key('keydown', 'Tab', document)
    first.focus()
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(isOpen(first)).toBe(true)
    key('keyup', 'Enter', first)
    expect(isOpen(first)).toBe(false)
  })

  it('leaves an open tooltip alone when some other control loses focus', () => {
    pointer('pointerdown', second)
    second.focus()
    pointer('pointerover', first)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    plain.focus()
    expect(isOpen(first)).toBe(true)
  })

  it('ignores controls without a tooltip', () => {
    pointer('pointerover', plain)
    key('keydown', 'Tab', document)
    plain.focus()
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(document.querySelector('[data-tooltip-open]')).toBeNull()
  })

  it('stops listening once uninstalled', () => {
    pointer('pointerover', first)
    uninstall()
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    pointer('pointerover', second)
    vi.advanceTimersByTime(TOOLTIP_DELAY_MS)
    expect(document.querySelector('[data-tooltip-open]')).toBeNull()
  })
})
