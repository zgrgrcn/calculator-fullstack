/** How long a pointer rests on a control, or focus stays on it, before its tooltip shows. */
export const TOOLTIP_DELAY_MS = 400

const CONTROL = '[data-tooltip]'
const OPEN = 'data-tooltip-open'

type Pending = { control: Element; timer: ReturnType<typeof setTimeout> }

/**
 * Drives the CSS tooltips: `[data-tooltip]::after` is visible while its
 * control carries `data-tooltip-open`, and this sets and clears that attribute.
 *
 * A tooltip opens after a short delay when a mouse or pen rests on its control
 * or when the control takes keyboard focus. A touch never opens one. It closes
 * the moment the pointer leaves, on any press, when the control is activated
 * from the keyboard, on Escape, or when focus moves on, and it does not come
 * back until the pointer leaves and returns. The `aria-label`s carry the same
 * text, so none of this changes what a screen reader announces.
 *
 * Returns a function that removes the listeners.
 */
export function installTooltips(
  doc: Document,
  delayMs: number = TOOLTIP_DELAY_MS,
): () => void {
  let pending: Pending | null = null
  let open: Element | null = null
  let lastInput: 'keyboard' | 'pointer' | null = null

  const cancel = () => {
    if (!pending) return
    clearTimeout(pending.timer)
    pending = null
  }
  const close = () => {
    cancel()
    if (open) open.removeAttribute(OPEN)
    open = null
  }
  const show = (control: Element) => {
    if (open === control || pending?.control === control) return
    close()
    const timer = setTimeout(() => {
      pending = null
      control.setAttribute(OPEN, '')
      open = control
    }, delayMs)
    pending = { control, timer }
  }
  /** The tooltip control an event happened on or inside, if any. */
  const controlOf = (event: Event): Element | null =>
    event.target instanceof Element ? event.target.closest(CONTROL) : null
  /** True when the pointer only moved between parts of the same control. */
  const stayedInside = (control: Element, event: PointerEvent): boolean =>
    event.relatedTarget instanceof Node && control.contains(event.relatedTarget)

  const onPointerOver = (event: PointerEvent) => {
    const control = controlOf(event)
    if (!control || event.pointerType === 'touch') return
    if (stayedInside(control, event)) return
    show(control)
  }
  const onPointerOut = (event: PointerEvent) => {
    const control = controlOf(event)
    if (!control || stayedInside(control, event)) return
    if (pending?.control === control) cancel()
    if (open === control) close()
  }
  const onPointerDown = () => {
    lastInput = 'pointer'
    close()
  }
  const onFocusIn = (event: FocusEvent) => {
    const control = controlOf(event)
    if (!control || lastInput === 'pointer') return
    if (!control.matches(':focus-visible')) return
    show(control)
  }
  const onFocusOut = (event: FocusEvent) => {
    const control = controlOf(event)
    if (control && (open === control || pending?.control === control)) close()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    lastInput = 'keyboard'
    if (event.key === 'Escape') close()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') close()
  }

  doc.addEventListener('pointerover', onPointerOver)
  doc.addEventListener('pointerout', onPointerOut)
  doc.addEventListener('pointerdown', onPointerDown)
  doc.addEventListener('focusin', onFocusIn)
  doc.addEventListener('focusout', onFocusOut)
  doc.addEventListener('keydown', onKeyDown)
  doc.addEventListener('keyup', onKeyUp)

  return () => {
    close()
    doc.removeEventListener('pointerover', onPointerOver)
    doc.removeEventListener('pointerout', onPointerOut)
    doc.removeEventListener('pointerdown', onPointerDown)
    doc.removeEventListener('focusin', onFocusIn)
    doc.removeEventListener('focusout', onFocusOut)
    doc.removeEventListener('keydown', onKeyDown)
    doc.removeEventListener('keyup', onKeyUp)
  }
}
