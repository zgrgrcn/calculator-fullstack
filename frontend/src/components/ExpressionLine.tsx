import { sizeFor } from './textSize'

interface Props {
  text: string
  /** True once the expression has been evaluated; CSS moves it up into place. */
  complete: boolean
}

/**
 * The small line above the main display. Its size bucket is the one the
 * expression had in the main line (without the closing "="), so the CSS
 * animation can start from the size it is leaving.
 */
export function ExpressionLine({ text, complete }: Props) {
  return (
    <p
      className="expression"
      data-testid="expression"
      data-size={sizeFor(text.replace(/ =$/, ''))}
      data-complete={complete || undefined}
    >
      <span className="line-text">
        <bdi>{text}</bdi>
      </span>
    </p>
  )
}
