import { describe, expect, it } from 'vitest'
import { formatExpression, formatUnary } from './expression'
import type { ExpressionToken } from './types'

const n = (text: string): ExpressionToken => ({ kind: 'number', text })
const op = (
  o: 'add' | 'subtract' | 'multiply' | 'divide' | 'power',
): ExpressionToken => ({ kind: 'operator', op: o })
const eq: ExpressionToken = { kind: 'equals' }

describe('formatExpression', () => {
  it('is empty for the initial state', () => {
    expect(formatExpression({ tokens: [], entry: null })).toBe('')
  })

  it('joins tokens with spaces and appends the entry being typed', () => {
    expect(formatExpression({ tokens: [n('2'), op('add')], entry: null })).toBe(
      '2 +',
    )
    expect(formatExpression({ tokens: [n('2'), op('add')], entry: '3' })).toBe(
      '2 + 3',
    )
    expect(
      formatExpression({
        tokens: [n('2'), op('add'), n('3'), op('multiply')],
        entry: null,
      }),
    ).toBe('2 + 3 ×')
    expect(
      formatExpression({
        tokens: [n('2'), op('add'), n('3'), op('multiply'), n('4'), eq],
        entry: null,
      }),
    ).toBe('2 + 3 × 4 =')
  })

  it('uses the calculator symbols for every operator', () => {
    expect(
      formatExpression({
        tokens: [
          n('8'),
          op('subtract'),
          n('2'),
          op('divide'),
          n('4'),
          op('power'),
        ],
        entry: null,
      }),
    ).toBe('8 − 2 ÷ 4 ^')
  })
})

describe('formatUnary', () => {
  it('wraps square roots and suffixes percentages', () => {
    expect(formatUnary('sqrt', '9')).toBe('√(9)')
    expect(formatUnary('percentage', '50')).toBe('50%')
    expect(formatUnary('sqrt', '√(81)')).toBe('√(√(81))')
  })
})
