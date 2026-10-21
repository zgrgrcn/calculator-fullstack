import type { CSSProperties } from 'react'
import type { Key as CalculatorKey } from '../calculator/types'
import type { KeyDef } from './keys'

interface Props {
  def: KeyDef
  disabled: boolean
  /** The backend does not offer this operation: dimmed as well as disabled. */
  unsupported?: boolean
  /** How often this key has been pressed; its parity restarts the press animation. */
  pressCount?: number
  title?: string
  onPress: (key: CalculatorKey) => void
}

export function Key({
  def,
  disabled,
  unsupported = false,
  pressCount = 0,
  title,
  onPress,
}: Props) {
  const style: CSSProperties = {}
  if (def.colSpan) style.gridColumn = `span ${def.colSpan}`
  if (def.rowSpan) style.gridRow = `span ${def.rowSpan}`
  const className = [
    'key',
    `key-${def.variant}`,
    def.colSpan ? 'key-wide' : '',
    def.rowSpan ? 'key-tall' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      className={className}
      aria-label={def.aria}
      title={title ?? (def.shortcut ? `Shortcut: ${def.shortcut}` : undefined)}
      disabled={disabled}
      data-unsupported={unsupported || undefined}
      data-pressed={pressCount > 0 ? pressCount % 2 : undefined}
      style={style}
      onClick={() => onPress(def.key)}
    >
      {def.label}
    </button>
  )
}
