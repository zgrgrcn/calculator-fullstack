import { useCalculator } from '../calculator/useCalculator'
import { useKeyboard } from '../calculator/useKeyboard'
import { useOperations } from '../calculator/useOperations'
import { Display } from './Display'
import { ExpressionLine } from './ExpressionLine'
import { Keypad } from './Keypad'
import { ThemePicker } from '../theme/ThemePicker'

export function Calculator() {
  const { display, expression, status, complete, press } = useCalculator()
  const ops = useOperations()
  useKeyboard(press)

  return (
    <main className="calculator">
      <ThemePicker />
      <ExpressionLine text={expression} complete={complete} />
      <Display
        text={display}
        error={status === 'error'}
        // Off while a chain such as 2 + 3 × 4 = is still evaluating, so the
        // fade plays once, on the final result.
        result={complete && status === 'idle'}
      />
      {ops.status === 'error' && (
        <p className="backend-status" role="alert">
          Backend unreachable
          <button type="button" onClick={ops.reload}>
            Retry
          </button>
        </p>
      )}
      <Keypad
        onPress={press}
        busy={status === 'computing'}
        supported={ops.supported}
      />
    </main>
  )
}
