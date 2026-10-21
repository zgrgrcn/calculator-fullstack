import { formatNumber } from './format'
import { isComplete } from './expression'
import type {
  Action,
  BinaryOp,
  EvaluationToken,
  ExpressionToken,
  Key,
  State,
  UnaryOp,
} from './types'

export const MAX_DIGITS = 15

export function initialState(nextRequestId = 1): State {
  return {
    tokens: [],
    entry: null,
    lastResult: null,
    status: 'idle',
    error: null,
    request: null,
    nextRequestId,
  }
}

/**
 * Pure state machine for the keypad. Keys only build the expression; the
 * frontend does no arithmetic. Equals places one `request` with the whole
 * token list in the state and waits for `resolved` or `failed`.
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
  if (state.status === 'error') {
    if (key.type !== 'digit' && key.type !== 'decimal') return state
    state = { ...state, tokens: [], error: null, status: 'idle' }
  }
  const complete = isComplete(state.tokens)
  switch (key.type) {
    case 'digit':
    case 'decimal': {
      if (complete) state = { ...state, tokens: [] }
      else if (state.entry === null && operandClosed(state.tokens)) return state
      const entry =
        key.type === 'digit'
          ? appendDigit(state.entry, key.value)
          : appendDecimal(state.entry)
      return { ...state, entry }
    }
    case 'backspace':
      return backspace(state, complete)
    case 'negate':
      return negate(state, complete)
    case 'operator':
      return onOperator(state, key.op, complete)
    case 'unary':
      return onUnary(state, key.op, complete)
    case 'equals':
      return onEquals(state, complete)
  }
}

// An operand is closed once it carries a unary or came from the last
// answer: digits no longer attach to it.
function operandClosed(tokens: readonly ExpressionToken[]): boolean {
  const last = tokens[tokens.length - 1]
  return last?.kind === 'number' || last?.kind === 'unary'
}

function endsWithOperator(tokens: readonly ExpressionToken[]): boolean {
  return tokens[tokens.length - 1]?.kind === 'operator'
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

function backspace(state: State, complete: boolean): State {
  if (state.entry !== null) {
    const next = state.entry.slice(0, -1)
    return { ...state, entry: next === '' || next === '-' ? null : next }
  }
  if (complete || state.tokens.length === 0) return state
  return { ...state, tokens: state.tokens.slice(0, -1) }
}

// Negation is a display edit of the number being typed, the one thing the
// frontend does to a number. After an answer it starts a new expression
// from the negated answer.
function negate(state: State, complete: boolean): State {
  if (state.entry !== null) {
    if (state.entry === '0') return state
    return {
      ...state,
      entry: state.entry.startsWith('-')
        ? state.entry.slice(1)
        : '-' + state.entry,
    }
  }
  if (complete && state.lastResult !== null)
    return { ...state, tokens: [numberToken(-state.lastResult)] }
  return state
}

function onOperator(state: State, op: BinaryOp, complete: boolean): State {
  const operator: ExpressionToken = { kind: 'operator', op }
  if (complete) return { ...state, tokens: [answerToken(state), operator] }
  if (state.entry !== null)
    return {
      ...state,
      tokens: [...state.tokens, entryToken(state.entry), operator],
      entry: null,
    }
  if (operandClosed(state.tokens))
    return { ...state, tokens: [...state.tokens, operator] }
  if (endsWithOperator(state.tokens))
    return { ...state, tokens: [...state.tokens.slice(0, -1), operator] }
  return { ...state, tokens: [numberToken(0), operator] }
}

function onUnary(state: State, op: UnaryOp, complete: boolean): State {
  const unary: ExpressionToken = { kind: 'unary', op }
  if (complete) return { ...state, tokens: [answerToken(state), unary] }
  if (state.entry !== null)
    return {
      ...state,
      tokens: [...state.tokens, entryToken(state.entry), unary],
      entry: null,
    }
  if (operandClosed(state.tokens))
    return { ...state, tokens: [...state.tokens, unary] }
  return state
}

function onEquals(state: State, complete: boolean): State {
  if (complete) return state
  const tokens =
    state.entry !== null
      ? [...state.tokens, entryToken(state.entry)]
      : [...state.tokens]
  if (tokens.length === 0 || endsWithOperator(tokens)) return state
  const evaluation = tokens.filter(
    (token): token is EvaluationToken => token.kind !== 'equals',
  )
  return {
    ...state,
    tokens,
    entry: null,
    status: 'computing',
    request: { id: state.nextRequestId, tokens: evaluation },
    nextRequestId: state.nextRequestId + 1,
  }
}

function onResolved(state: State, id: number, value: number): State {
  if (!state.request || state.request.id !== id) return state
  return {
    ...state,
    tokens: [...state.tokens, { kind: 'equals' }],
    lastResult: value,
    status: 'idle',
    error: null,
    request: null,
  }
}

function onFailed(state: State, id: number, message: string): State {
  if (!state.request || state.request.id !== id) return state
  return { ...state, status: 'error', error: message, request: null }
}

function entryToken(text: string): ExpressionToken {
  return { kind: 'number', text, value: Number(text) }
}

function numberToken(value: number): ExpressionToken {
  return { kind: 'number', text: formatNumber(value), value }
}

function answerToken(state: State): ExpressionToken {
  return numberToken(state.lastResult ?? 0)
}
