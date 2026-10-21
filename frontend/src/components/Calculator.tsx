import { useState } from 'react'
import { useCalculator } from '../calculator/useCalculator'
import { useKeyboard } from '../calculator/useKeyboard'
import { useOperations } from '../calculator/useOperations'
import { HistoryPanel } from '../history/HistoryPanel'
import { useHistory } from '../history/useHistory'
import { Display } from './Display'
import { ExpressionLine } from './ExpressionLine'
import { Keypad } from './Keypad'

export function Calculator() {
  const history = useHistory()
  const [historyOpen, setHistoryOpen] = useState(false)
  const { display, expression, complete, status, press } = useCalculator({
    onResult: history.add,
  })
  const ops = useOperations()
  // While the history panel is open, keys belong to it (Escape closes it).
  useKeyboard(press, !historyOpen)

  return (
    <main className="calculator">
      <div className="toolbar">
        <button
          type="button"
          className="history-button"
          onClick={() => setHistoryOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={historyOpen}
        >
          History
        </button>
      </div>
      <ExpressionLine text={expression} complete={complete} />
      {/* The attribute stays off while a chain is still computing, so the fade plays once on the final result. */}
      <Display
        text={display}
        error={status === 'error'}
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
      {historyOpen && (
        <HistoryPanel
          entries={history.entries}
          onClear={history.clear}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </main>
  )
}
