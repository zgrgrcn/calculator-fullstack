interface Props {
  text: string
}

/** What was pressed so far, in a small line above the main display. */
export function ExpressionLine({ text }: Props) {
  return (
    <p className="expression" data-testid="expression">
      {text}
    </p>
  )
}
