import type { BinaryOp, ExpressionToken, State, UnaryOp } from './types'

export const OPERATOR_SYMBOLS: Record<BinaryOp, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
}

/** The expression line: every pressed token, then the entry still being typed. Pure. */
export function formatExpression(
  state: Pick<State, 'tokens' | 'entry'>,
): string {
  const parts = state.tokens.map(tokenText)
  if (state.entry !== null) parts.push(state.entry)
  return parts.join(' ')
}

/** Function form of a unary operation applied to `inner`: √(9), 50%. */
export function formatUnary(op: UnaryOp, inner: string): string {
  return op === 'sqrt' ? `√(${inner})` : `${inner}%`
}

function tokenText(token: ExpressionToken): string {
  switch (token.kind) {
    case 'number':
      return token.text
    case 'operator':
      return OPERATOR_SYMBOLS[token.op]
    case 'equals':
      return '='
  }
}
