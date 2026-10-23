import type { Size } from './size'

interface Props {
  text: string
  /** True once the expression has been evaluated; CSS moves it up into place. */
  complete: boolean
  /** The size bucket the expression had in the main line, where the CSS animation starts from. */
  size: Size
}

/** The small line above the main display. */
export function ExpressionLine({ text, complete, size }: Props) {
  return (
    <p
      className="expression"
      data-testid="expression"
      data-size={size}
      data-complete={complete || undefined}
    >
      <span className="line-text">
        <bdi>{text}</bdi>
      </span>
    </p>
  )
}
