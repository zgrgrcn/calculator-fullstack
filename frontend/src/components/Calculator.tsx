import { useCallback, useRef, useState } from 'react'
import { useCalculator } from '../calculator/useCalculator'
import { useKeyboard } from '../calculator/useKeyboard'
import { useOperations } from '../calculator/useOperations'
import type { Key as CalculatorKey } from '../calculator/types'
import { HistoryDropdown } from '../history/HistoryDropdown'
import type { HistoryEntry } from '../history/history'
import { useHistory } from '../history/useHistory'
import { Display } from './Display'
import { ExpressionLine } from './ExpressionLine'
import { Keypad } from './Keypad'
import { keyId } from './keys'

export function Calculator() {
  const history = useHistory()
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyAnchor = useRef<HTMLDivElement>(null)
  const { display, expression, complete, status, press, insert } =
    useCalculator({ onResult: history.add })
  const ops = useOperations()

  // Every press, from a click or the keyboard, bumps the key's count; the
  // count's parity restarts the key's CSS press animation.
  const [pressCounts, setPressCounts] = useState<
    Readonly<Record<string, number>>
  >({})
  const pressWithFeedback = useCallback(
    (key: CalculatorKey) => {
      const id = keyId(key)
      setPressCounts((previous) => ({
        ...previous,
        [id]: (previous[id] ?? 0) + 1,
      }))
      press(key)
    },
    [press],
  )
  // While the history dropdown is open, keys belong to it (Escape closes it).
  useKeyboard(pressWithFeedback, !historyOpen)

  const closeHistory = useCallback(() => setHistoryOpen(false), [])
  const chooseHistory = useCallback(
    (entry: HistoryEntry) => {
      insert(entry.value)
      setHistoryOpen(false)
    },
    [insert],
  )

  return (
    <main className="calculator">
      <div className="panel">
        <div className="panel-top">
          <div className="history-anchor" ref={historyAnchor}>
            <button
              type="button"
              className="history-button"
              onClick={() => setHistoryOpen((open) => !open)}
              aria-label="History"
              data-tooltip="History"
              aria-haspopup="dialog"
              aria-expanded={historyOpen}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </button>
            {historyOpen && (
              <HistoryDropdown
                entries={history.entries}
                anchorRef={historyAnchor}
                onSelect={chooseHistory}
                onClear={history.clear}
                onClose={closeHistory}
              />
            )}
          </div>
          <ExpressionLine text={expression} complete={complete} />
        </div>
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
          onPress={pressWithFeedback}
          busy={status === 'computing'}
          supported={ops.supported}
          pressCounts={pressCounts}
        />
      </div>
    </main>
  )
}
