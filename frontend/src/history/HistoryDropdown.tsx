import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { HistoryEntry } from './history'

interface Props {
  entries: readonly HistoryEntry[]
  /** The element the dropdown hangs from; pointer events inside it are not "outside". */
  anchorRef: RefObject<HTMLElement | null>
  onSelect: (entry: HistoryEntry) => void
  onClear: () => void
  onClose: () => void
}

/**
 * Finished evaluations newest first, dropped down under the history button.
 * Escape, a click outside the anchor, the × icon, or choosing an entry
 * closes it.
 */
export function HistoryDropdown({
  entries,
  anchorRef,
  onSelect,
  onClear,
  onClose,
}: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    const onPointerDown = (event: PointerEvent) => {
      const anchor = anchorRef.current
      if (
        anchor &&
        event.target instanceof Node &&
        !anchor.contains(event.target)
      )
        onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [anchorRef, onClose])

  return (
    <section className="history-dropdown" role="dialog" aria-label="History">
      <header className="history-header">
        <h2>History</h2>
        <div className="history-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Clear history"
            data-tooltip="Clear history"
            onClick={onClear}
            disabled={entries.length === 0}
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
              <path d="M4 7h16" />
              <path d="M10 7V4h4v3" />
              <path d="M6 7l1 13h10l1-13" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            data-tooltip="Close"
            onClick={onClose}
            autoFocus
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
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        </div>
      </header>
      {entries.length === 0 ? (
        <p className="history-empty">No calculations yet</p>
      ) : (
        <ol className="history-list">
          {entries.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <button
                type="button"
                className="history-entry"
                onClick={() => onSelect(entry)}
              >
                <span className="history-expression">{entry.expression} =</span>{' '}
                <span className="history-result">{entry.result}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
