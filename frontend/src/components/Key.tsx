import type { CSSProperties } from 'react'
import type { Key as CalculatorKey } from '../calculator/types'
import type { KeyDef } from './keys'

interface Props {
  def: KeyDef
  disabled: boolean
  /** The backend does not offer this operation: dimmed as well as disabled. */
  unsupported?: boolean
  title?: string
  onPress: (key: CalculatorKey) => void
}

export function Key({
  def,
  disabled,
  unsupported = false,
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
      style={style}
      onClick={() => onPress(def.key)}
    >
      {def.label}
    </button>
  )
}
