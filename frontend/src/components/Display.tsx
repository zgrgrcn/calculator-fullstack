import { sizeFor } from './textSize'

interface Props {
  text: string
  error: boolean
  /** True once an answer is shown; CSS fades it in. */
  result: boolean
}

export function Display({ text, error, result }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="display"
      data-size={sizeFor(text)}
      data-error={error || undefined}
      data-result={result || undefined}
    >
      {text}
    </div>
  )
}
