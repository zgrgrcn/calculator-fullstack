interface Props {
  text: string
  /** The expression ended with `=`; the CSS animates the line into place. */
  complete: boolean
}

/** What was pressed so far, in a small line above the main display. */
export function ExpressionLine({ text, complete }: Props) {
  return (
    <p
      className="expression"
      data-testid="expression"
      data-complete={complete || undefined}
    >
      {text}
    </p>
  )
}
