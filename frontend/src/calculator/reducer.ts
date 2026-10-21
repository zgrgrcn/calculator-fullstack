import { formatNumber } from './format'
import type {
  Action,
  BinaryOp,
  Key,
  ReductionAfter,
  Request,
  State,
} from './types'

export const MAX_DIGITS = 15

export function initialState(nextRequestId = 1): State {
  return {
    display: '0',
    entry: null,
    value: 0,
    stack: [],
    awaitingOperand: false,
    status: 'idle',
    request: null,
    nextRequestId,
  }
}

const PRECEDENCE: Record<BinaryOp, number> = {
  add: 1,
  subtract: 1,
  multiply: 2,
  divide: 2,
  power: 3,
}

// Reduce the pending operator when it binds at least as tightly as the new
// one, so 2 + 3 × 4 = 14. Power is right-associative: 2 ^ 3 ^ 2 = 2 ^ 9.
export function shouldReduce(top: BinaryOp, incoming: BinaryOp): boolean {
  const t = PRECEDENCE[top]
  const i = PRECEDENCE[incoming]
  return t > i || (t === i && incoming !== 'power')
}

/**
 * Pure state machine for the keypad. It never performs I/O: when arithmetic
 * is needed it places one `request` in the state and waits for `resolved`
 * or `failed`.
 */
export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'key':
      return onKey(state, action.key)
    case 'resolved':
      return onResolved(state, action.id, action.value)
    case 'failed':
      return onFailed(state, action.id, action.message)
  }
}

function onKey(state: State, key: Key): State {
  if (key.type === 'clear') return initialState(state.nextRequestId)
  if (state.status === 'computing') return state
  if (
    state.status === 'error' &&
    key.type !== 'digit' &&
    key.type !== 'decimal'
  )
    return state
  switch (key.type) {
    case 'digit':
      return withEntry(state, appendDigit(state.entry, key.value))
    case 'decimal':
      return withEntry(state, appendDecimal(state.entry))
    case 'backspace':
      return state.entry === null
        ? state
        : withEntry(state, deleteLast(state.entry))
    case 'negate':
      return negate(state)
    case 'operator':
      return onOperator(state, key.op)
    case 'equals':
      return state.stack.length === 0
        ? { ...state, entry: null }
        : startReduction(state, { kind: 'equals' })
    case 'unary':
      return emit(state, {
        op: key.op,
        operands: [state.value],
        after: { kind: 'unary' },
      })
  }
}

function withEntry(state: State, entry: string): State {
  return {
    ...state,
    entry,
    value: Number(entry),
    display: entry,
    awaitingOperand: false,
    status: 'idle',
  }
}

function appendDigit(entry: string | null, digit: string): string {
  if (entry === null || entry === '0') return digit
  if (entry === '-0') return '-' + digit
  if (entry.replace(/\D/g, '').length >= MAX_DIGITS) return entry
  return entry + digit
}

function appendDecimal(entry: string | null): string {
  if (entry === null) return '0.'
  return entry.includes('.') ? entry : entry + '.'
}

function deleteLast(entry: string): string {
  const next = entry.slice(0, -1)
  return next === '' || next === '-' ? '0' : next
}

// Negation is a display edit, not an arithmetic operation, so it stays local.
function negate(state: State): State {
  if (state.entry !== null) {
    if (state.entry === '0') return { ...state, awaitingOperand: false }
    const entry = state.entry.startsWith('-')
      ? state.entry.slice(1)
      : '-' + state.entry
    return {
      ...state,
      entry,
      value: Number(entry),
      display: entry,
      awaitingOperand: false,
    }
  }
  if (state.value === 0) return { ...state, awaitingOperand: false }
  const value = -state.value
  return {
    ...state,
    value,
    display: formatNumber(value),
    awaitingOperand: false,
  }
}

function onOperator(state: State, op: BinaryOp): State {
  if (state.awaitingOperand && state.stack.length > 0) {
    const top = state.stack[state.stack.length - 1]
    return { ...state, stack: [...state.stack.slice(0, -1), { ...top, op }] }
  }
  return startReduction(state, { kind: 'operator', op })
}

// Either emits one request for the top of the stack, or pushes the current
// value under the new operator. Called again after each result until no
// reduction is needed.
function startReduction(state: State, after: ReductionAfter): State {
  const top = state.stack[state.stack.length - 1]
  if (top && (after.kind === 'equals' || shouldReduce(top.op, after.op))) {
    return emit(state, {
      op: top.op,
      operands: [top.value, state.value],
      after,
    })
  }
  if (after.kind === 'operator') {
    return {
      ...state,
      stack: [...state.stack, { value: state.value, op: after.op }],
      awaitingOperand: true,
      entry: null,
      status: 'idle',
    }
  }
  return { ...state, entry: null, status: 'idle' }
}

function emit(state: State, request: Omit<Request, 'id'>): State {
  return {
    ...state,
    request: { id: state.nextRequestId, ...request },
    status: 'computing',
    nextRequestId: state.nextRequestId + 1,
  }
}

function onResolved(state: State, id: number, value: number): State {
  if (!state.request || state.request.id !== id) return state
  const { after } = state.request
  const stack = after.kind === 'unary' ? state.stack : state.stack.slice(0, -1)
  const next: State = {
    ...state,
    stack,
    value,
    display: formatNumber(value),
    entry: null,
    awaitingOperand: false,
    status: 'idle',
    request: null,
  }
  return after.kind === 'unary' ? next : startReduction(next, after)
}

function onFailed(state: State, id: number, message: string): State {
  if (!state.request || state.request.id !== id) return state
  return {
    ...state,
    status: 'error',
    display: message,
    stack: [],
    entry: null,
    awaitingOperand: false,
    request: null,
  }
}
