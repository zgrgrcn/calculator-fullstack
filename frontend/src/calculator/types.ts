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

/** One element of the expression. A unary applies to the operand before it. */
export type ExpressionToken =
  | { kind: 'number'; text: string; value: number }
  | { kind: 'operator'; op: BinaryOp }
  | { kind: 'unary'; op: UnaryOp }
  | { kind: 'equals' }

/** What is sent to the backend: the expression without its closing equals. */
export type EvaluationToken = Exclude<ExpressionToken, { kind: 'equals' }>

export interface Request {
  id: number
  tokens: readonly EvaluationToken[]
}

export type Action =
  | { type: 'key'; key: Key }
  | { type: 'resolved'; id: number; value: number }
  | { type: 'failed'; id: number; message: string }
  /** Start a new expression from a value chosen elsewhere, such as a history entry. */
  | { type: 'insert'; value: number }

export type Status = 'idle' | 'computing' | 'error'

export interface State {
  /** Committed tokens; a trailing equals marks an evaluated expression. */
  tokens: readonly ExpressionToken[]
  /** The number being typed, not yet a token. */
  entry: string | null
  /** The most recent answer, shown as "Ans = …" and continued from by an operator. */
  lastResult: number | null
  status: Status
  /** Message shown in the main line while status is error. */
  error: string | null
  /** At most one request in flight, sent on equals. */
  request: Request | null
  /** Monotonic; survives AC so a late response can be told apart. */
  nextRequestId: number
}
