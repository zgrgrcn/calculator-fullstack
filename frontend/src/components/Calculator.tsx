import { useCalculator } from '../calculator/useCalculator'
import { useKeyboard } from '../calculator/useKeyboard'
import { useOperations } from '../calculator/useOperations'
import { Display } from './Display'
import { ExpressionLine } from './ExpressionLine'
import { Keypad } from './Keypad'

export function Calculator() {
  const { display, expression, status, press } = useCalculator()
  const ops = useOperations()
  useKeyboard(press)

  return (
    <main className="calculator">
      <ExpressionLine text={expression} />
      <Display text={display} error={status === 'error'} />
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
