interface Props {
  text: string
  error: boolean
  /** The text is the final result of `=`; the CSS fades it in. */
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

// CSS attribute selectors cannot compare numbers, so the size bucket is
// computed here.
function sizeFor(text: string): 'normal' | 'small' | 'tiny' {
  if (text.length <= 9) return 'normal'
  if (text.length <= 14) return 'small'
  return 'tiny'
}
