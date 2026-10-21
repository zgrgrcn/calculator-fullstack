import { useEffect } from 'react'
import type { HistoryEntry } from './history'

interface Props {
  entries: readonly HistoryEntry[]
  onClear: () => void
  onClose: () => void
}

/** Lists finished evaluations newest first; Escape or the Close button dismisses it. */
export function HistoryPanel({ entries, onClear, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section
      className="history-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-title"
    >
      <header className="history-header">
        <h2 id="history-title">History</h2>
        <div className="history-actions">
          <button
            type="button"
            onClick={onClear}
            disabled={entries.length === 0}
          >
            Clear
          </button>
          <button type="button" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </header>
      {entries.length === 0 ? (
        <p className="history-empty">No calculations yet</p>
      ) : (
        <ol className="history-list">
          {entries.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className="history-expression">{entry.expression} =</span>{' '}
              <span className="history-result">{entry.result}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
