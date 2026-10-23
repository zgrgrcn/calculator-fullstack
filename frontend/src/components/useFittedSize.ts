import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { fitSize } from './size'
import type { Size } from './size'

export interface FittedRefs {
  /** The sized box; the bucket is applied to it as `data-size`. */
  box: RefObject<HTMLElement | null>
  /** The line inside the box that clips overflowing text. */
  line: RefObject<HTMLElement | null>
  /** The text inside the line. */
  content: RefObject<HTMLElement | null>
}

/**
 * The largest size bucket at which `text` fits its line without clipping,
 * found by applying each bucket to the box and measuring what the browser
 * laid out, so every font and viewport is measured rather than guessed from
 * a character count. Runs before paint whenever the text changes, and again
 * when the box or the line is resized (a narrower viewport, another theme's
 * font), so no frame shows a wrong size.
 */
export function useFittedSize(text: string, refs: FittedRefs): Size {
  const [size, setSize] = useState<Size>('normal')
  const { box, line, content } = refs
  useLayoutEffect(() => {
    const boxEl = box.current
    const lineEl = line.current
    const contentEl = content.current
    if (!boxEl || !lineEl || !contentEl) return
    const measure = () => {
      setSize(
        fitSize((candidate) => {
          boxEl.dataset.size = candidate
          return (
            contentEl.getBoundingClientRect().width <=
            lineEl.getBoundingClientRect().width
          )
        }),
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(boxEl)
    observer.observe(lineEl)
    return () => observer.disconnect()
  }, [text, box, line, content])
  return size
}
