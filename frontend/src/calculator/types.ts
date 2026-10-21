import type { OperationName } from '../api/types'

export type BinaryOp = Extract<
  OperationName,
  'add' | 'subtract' | 'multiply' | 'divide' | 'power'
>
export type UnaryOp = Extract<OperationName, 'sqrt' | 'percentage'>
export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

export type Key =
  | { type: 'digit'; value: Digit }
  | { type: 'decimal' }
  | { type: 'negate' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'operator'; op: BinaryOp }
  | { type: 'unary'; op: UnaryOp }
  | { type: 'equals' }

export type Action =
  | { type: 'key'; key: Key }
  | { type: 'resolved'; id: number; value: number }
  | { type: 'failed'; id: number; message: string }

/** What the reducer does once the in-flight request resolves. */
export type After =
  { kind: 'operator'; op: BinaryOp } | { kind: 'equals' } | { kind: 'unary' }
export type ReductionAfter = Exclude<After, { kind: 'unary' }>

export interface Request {
  id: number
  op: BinaryOp | UnaryOp
  operands: number[]
  after: After
}

export interface PendingOperand {
  value: number
  op: BinaryOp
}

export type Status = 'idle' | 'computing' | 'error'

export interface State {
  /** Text on screen: the entry being typed, a formatted result, or an error message. */
  display: string
  /** Digits typed so far; null once the display shows a computed value. */
  entry: string | null
  /** Numeric value of the current operand. */
  value: number
  /** Left operands waiting for their right operand, innermost last. */
  stack: PendingOperand[]
  /** True right after an operator key, until the right operand starts. */
  awaitingOperand: boolean
  status: Status
  /** At most one request in flight. */
  request: Request | null
  /** Monotonic; survives AC so a late response can be told apart. */
  nextRequestId: number
}
