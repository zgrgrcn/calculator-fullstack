import type { ApiToken } from '../api/types'
import { formatNumber } from './format'
import type {
  BinaryOp,
  EvaluationToken,
  ExpressionToken,
  State,
  UnaryOp,
} from './types'

export const OPERATOR_SYMBOLS: Record<BinaryOp, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
}

/** The expression as text: committed tokens, then the number still being typed. Pure. */
export function formatExpression(
  state: Pick<State, 'tokens' | 'entry'>,
): string {
  const parts: string[] = []
  for (const token of state.tokens) {
    switch (token.kind) {
      case 'number':
        parts.push(token.text)
        break
      case 'operator':
        parts.push(OPERATOR_SYMBOLS[token.op])
        break
      case 'unary':
        if (parts.length === 0) parts.push(formatUnary(token.op, ''))
        else
          parts[parts.length - 1] = formatUnary(
            token.op,
            parts[parts.length - 1],
          )
        break
      case 'equals':
        parts.push('=')
        break
    }
  }
  if (state.entry !== null) parts.push(state.entry)
  return parts.join(' ')
}

/** Function form of a unary operation applied to `inner`: √(9), 50%. */
export function formatUnary(op: UnaryOp, inner: string): string {
  return op === 'sqrt' ? `√(${inner})` : `${inner}%`
}

/** True once the expression has been evaluated: its last token is equals. */
export function isComplete(tokens: readonly ExpressionToken[]): boolean {
  return tokens[tokens.length - 1]?.kind === 'equals'
}

/** The main line: an error message, the answer, or the expression being typed. */
export function mainText(state: State): string {
  if (state.status === 'error' && state.error !== null) return state.error
  if (isComplete(state.tokens) && state.lastResult !== null)
    return formatNumber(state.lastResult)
  return formatExpression(state) || '0'
}

/** The small line above: the evaluated or failed expression, otherwise the last answer. */
export function secondaryText(state: State): string {
  if (isComplete(state.tokens) || state.status === 'error')
    return formatExpression({ tokens: state.tokens, entry: null })
  return state.lastResult === null
    ? ''
    : `Ans = ${formatNumber(state.lastResult)}`
}

/** Converts the expression to the wire format of POST /api/v1/evaluate. */
export function toApiTokens(tokens: readonly EvaluationToken[]): ApiToken[] {
  return tokens.map((token): ApiToken => {
    switch (token.kind) {
      case 'number':
        return { type: 'number', value: token.value }
      case 'operator':
        return { type: 'operator', op: token.op }
      case 'unary':
        return { type: 'unary', op: token.op }
    }
  })
}
