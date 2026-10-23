import { useLayoutEffect, useRef } from 'react'
import type { Size } from './size'
import { useFittedSize } from './useFittedSize'

interface Props {
  text: string
  error: boolean
  /** True once an answer is shown; CSS fades it in. */
  result: boolean
  /** Reports the size bucket the text is shown at, whenever it changes. */
  onSize?: (size: Size) => void
}

/**
 * The main line. Its size bucket is measured: the largest at which the whole
 * text fits the line, so no result the formatter can produce is ever clipped.
 */
export function Display({ text, error, result, onSize }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const line = useRef<HTMLSpanElement>(null)
  const content = useRef<HTMLElement>(null)
  const size = useFittedSize(text, { box, line, content })
  useLayoutEffect(() => {
    onSize?.(size)
  }, [size, onSize])
  return (
    <div
      ref={box}
      role="status"
      aria-live="polite"
      className="display"
      data-size={size}
      data-error={error || undefined}
      data-result={result || undefined}
    >
      <span ref={line} className="line-text">
        <bdi ref={content}>{text}</bdi>
      </span>
    </div>
  )
}
