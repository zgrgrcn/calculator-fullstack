import type { OperationName } from '../api/types'
import type { Key as CalculatorKey } from '../calculator/types'
import { Key } from './Key'
import { KEY_LAYOUT } from './keys'
import type { KeyDef } from './keys'

interface Props {
  onPress: (key: CalculatorKey) => void
  /** A request is in flight: every key but AC is disabled. */
  busy: boolean
  /** Operations the backend advertises; null until the handshake answers. */
  supported: ReadonlySet<OperationName> | null
}

export function Keypad({ onPress, busy, supported }: Props) {
  return (
    <div className="keypad" aria-busy={busy}>
      {KEY_LAYOUT.map((def) => {
        const unsupported = isUnsupported(def, supported)
        return (
          <Key
            key={def.aria}
            def={def}
            disabled={(busy && def.key.type !== 'clear') || unsupported}
            title={unsupported ? 'Not supported by the backend' : undefined}
            onPress={onPress}
          />
        )
      })}
    </div>
  )
}

function isUnsupported(
  def: KeyDef,
  supported: ReadonlySet<OperationName> | null,
): boolean {
  if (!supported) return false
  const { key } = def
  return (
    (key.type === 'operator' || key.type === 'unary') && !supported.has(key.op)
  )
}
