import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Display } from './Display'
import type { Size } from './size'

/** Font size of each bucket in px, as the stylesheet sets them (jsdom loads no CSS). */
const FONT_PX: Record<Size, number> = {
  normal: 56,
  medium: 48,
  small: 40,
  compact: 32,
  tiny: 25.6,
  micro: 19.2,
  nano: 16,
}

/** Width of one character relative to the font size: wide, like a monospace face. */
const CHAR_EM = 0.6

/** Display content width at a 320px viewport: 320 less page, panel and display padding and the border. */
const PHONE_320 = 238
/** The same at the 400px desktop column. */
const DESKTOP = 318

/**
 * Stands in for layout: the text is as wide as its characters at the current
 * bucket's font size, and the line is that wide too but never wider than the
 * display, which is where clipping starts.
 */
function fakeLayout(displayWidth: number): { width: number } {
  const layout = { width: displayWidth }
  const widthOf = (element: Element): number => {
    const display = element.closest('.display')
    if (!display) return 0
    const size = (display.getAttribute('data-size') ?? 'normal') as Size
    const text = (display.textContent ?? '').length * CHAR_EM * FONT_PX[size]
    if (element.tagName === 'BDI') return text
    if (element.classList.contains('line-text'))
      return Math.min(text, layout.width)
    return layout.width
  }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const width = widthOf(this)
      return {
        width,
        height: 0,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: 0,
        toJSON: () => ({}),
      } as DOMRect
    },
  )
  return layout
}

/** True when the text is wider than the line that clips it. */
function clipped(display: HTMLElement): boolean {
  const line = display.querySelector('.line-text') as Element
  const text = display.querySelector('bdi') as Element
  return text.getBoundingClientRect().width > line.getBoundingClientRect().width
}

const RESULT_OF_ONE_THIRD = '0.333333333333'

describe('Display', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows 0.333333333333 whole on a 320px phone', () => {
    fakeLayout(PHONE_320)
    const { getByRole } = render(
      <Display text={RESULT_OF_ONE_THIRD} error={false} result />,
    )
    const display = getByRole('status')
    expect(display).toHaveTextContent(RESULT_OF_ONE_THIRD)
    expect(display).toHaveAttribute('data-size', 'tiny')
    expect(clipped(display)).toBe(false)
  })

  it('keeps the same result larger where there is room', () => {
    fakeLayout(DESKTOP)
    const { getByRole } = render(
      <Display text={RESULT_OF_ONE_THIRD} error={false} result />,
    )
    const display = getByRole('status')
    expect(display).toHaveAttribute('data-size', 'compact')
    expect(clipped(display)).toBe(false)
  })

  it.each([
    ['the longest fixed-notation result', '-0.00000123456789012'],
    ['the longest exponent-form result', '-1.23456789012e-300'],
    ['fifteen typed digits with a sign and a point', '-0.12345678901234'],
  ])('fits %s on a 320px phone', (_, text) => {
    fakeLayout(PHONE_320)
    const { getByRole } = render(<Display text={text} error={false} result />)
    expect(clipped(getByRole('status'))).toBe(false)
  })

  it('shrinks an error message below 1.6rem only when it must', () => {
    fakeLayout(PHONE_320)
    const { getByRole } = render(
      <Display text="Cannot divide by zero" error result={false} />,
    )
    const display = getByRole('status')
    expect(display).toHaveAttribute('data-size', 'nano')
    expect(clipped(display)).toBe(false)
  })

  it('keeps a short answer at the normal size', () => {
    fakeLayout(PHONE_320)
    const { getByRole } = render(<Display text="0" error={false} result />)
    expect(getByRole('status')).toHaveAttribute('data-size', 'normal')
  })

  it('clips only an over-long expression, at the smallest size', () => {
    fakeLayout(PHONE_320)
    const { getByRole } = render(
      <Display text={'1 + '.repeat(12) + '1'} error={false} result={false} />,
    )
    const display = getByRole('status')
    expect(display).toHaveAttribute('data-size', 'nano')
    expect(clipped(display)).toBe(true)
  })

  it('measures again when the text changes', () => {
    fakeLayout(PHONE_320)
    const { getByRole, rerender } = render(
      <Display text="0" error={false} result={false} />,
    )
    rerender(<Display text={RESULT_OF_ONE_THIRD} error={false} result />)
    expect(getByRole('status')).toHaveAttribute('data-size', 'tiny')
  })

  it('measures again when the display is resized', () => {
    const callbacks: ResizeObserverCallback[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback)
        }
        observe() {}
        disconnect() {}
      },
    )
    const layout = fakeLayout(DESKTOP)
    const { getByRole, unmount } = render(
      <Display text={RESULT_OF_ONE_THIRD} error={false} result />,
    )
    expect(getByRole('status')).toHaveAttribute('data-size', 'compact')
    layout.width = PHONE_320
    act(() => {
      for (const callback of callbacks) callback([], {} as ResizeObserver)
    })
    expect(getByRole('status')).toHaveAttribute('data-size', 'tiny')
    expect(clipped(getByRole('status'))).toBe(false)
    unmount()
    vi.unstubAllGlobals()
  })

  it('reports the bucket it settled on', () => {
    fakeLayout(PHONE_320)
    const onSize = vi.fn()
    render(
      <Display
        text={RESULT_OF_ONE_THIRD}
        error={false}
        result
        onSize={onSize}
      />,
    )
    expect(onSize).toHaveBeenLastCalledWith('tiny')
  })
})
