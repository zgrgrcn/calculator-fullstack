import type { Digit, Key } from '../calculator/types'

export type Variant = 'digit' | 'operator' | 'function'

export interface KeyDef {
  key: Key
  label: string
  /** Accessible name; also what the tests click. */
  aria: string
  variant: Variant
  shortcut?: string
  colSpan?: number
  rowSpan?: number
}

const digit = (value: Digit): KeyDef => ({
  key: { type: 'digit', value },
  label: value,
  aria: value,
  variant: 'digit',
  shortcut: value,
})

/** Grid order, four columns, iOS layout plus a row for the advanced keys. */
export const KEY_LAYOUT: KeyDef[] = [
  {
    key: { type: 'clear' },
    label: 'AC',
    aria: 'All clear',
    variant: 'function',
    shortcut: 'Escape',
  },
  {
    key: { type: 'backspace' },
    label: '⌫',
    aria: 'Backspace',
    variant: 'function',
    shortcut: 'Backspace',
  },
  {
    key: { type: 'unary', op: 'percentage' },
    label: '%',
    aria: 'Percent',
    variant: 'function',
    shortcut: '%',
  },
  {
    key: { type: 'operator', op: 'divide' },
    label: '÷',
    aria: 'Divide',
    variant: 'operator',
    shortcut: '/',
  },
  {
    key: { type: 'unary', op: 'sqrt' },
    label: '√',
    aria: 'Square root',
    variant: 'function',
    shortcut: 's',
  },
  {
    key: { type: 'operator', op: 'power' },
    label: 'xʸ',
    aria: 'Power',
    variant: 'function',
    shortcut: '^',
  },
  { key: { type: 'negate' }, label: '±', aria: 'Negate', variant: 'function' },
  {
    key: { type: 'operator', op: 'multiply' },
    label: '×',
    aria: 'Multiply',
    variant: 'operator',
    shortcut: '*',
  },
  digit('7'),
  digit('8'),
  digit('9'),
  {
    key: { type: 'operator', op: 'subtract' },
    label: '−',
    aria: 'Subtract',
    variant: 'operator',
    shortcut: '-',
  },
  digit('4'),
  digit('5'),
  digit('6'),
  {
    key: { type: 'operator', op: 'add' },
    label: '+',
    aria: 'Add',
    variant: 'operator',
    shortcut: '+',
  },
  digit('1'),
  digit('2'),
  digit('3'),
  {
    key: { type: 'equals' },
    label: '=',
    aria: 'Equals',
    variant: 'operator',
    shortcut: 'Enter',
    rowSpan: 2,
  },
  { ...digit('0'), colSpan: 2 },
  {
    key: { type: 'decimal' },
    label: '.',
    aria: 'Decimal point',
    variant: 'digit',
    shortcut: '.',
  },
]
