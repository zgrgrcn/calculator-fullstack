interface Props {
  text: string
  error: boolean
}

export function Display({ text, error }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="display"
      data-size={sizeFor(text)}
      data-error={error || undefined}
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
