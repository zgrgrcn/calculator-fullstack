import { describe, expect, it } from 'vitest'
import {
  formatExpression,
  formatUnary,
  isComplete,
  mainText,
  secondaryText,
  toApiTokens,
} from './expression'
import { initialState } from './reducer'
import type { EvaluationToken, ExpressionToken, State } from './types'

const n = (text: string, value = Number(text)): ExpressionToken => ({
  kind: 'number',
  text,
  value,
})
const op = (
  o: 'add' | 'subtract' | 'multiply' | 'divide' | 'power',
): ExpressionToken => ({ kind: 'operator', op: o })
const un = (o: 'sqrt' | 'percentage'): ExpressionToken => ({
  kind: 'unary',
  op: o,
})
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

  it('writes postfix unary tokens in function form around their operand', () => {
    expect(
      formatExpression({
        tokens: [n('196'), un('percentage'), op('multiply'), n('5')],
        entry: null,
      }),
    ).toBe('196% × 5')
    expect(
      formatExpression({
        tokens: [n('81'), un('sqrt'), un('sqrt')],
        entry: null,
      }),
    ).toBe('√(√(81))')
    expect(formatExpression({ tokens: [un('sqrt')], entry: null })).toBe('√()')
  })
})

describe('formatUnary', () => {
  it('wraps square roots and suffixes percentages', () => {
    expect(formatUnary('sqrt', '9')).toBe('√(9)')
    expect(formatUnary('percentage', '50')).toBe('50%')
  })
})

describe('isComplete', () => {
  it('is true only when the last token is equals', () => {
    expect(isComplete([])).toBe(false)
    expect(isComplete([n('2')])).toBe(false)
    expect(isComplete([n('2'), op('add')])).toBe(false)
    expect(isComplete([n('2'), op('add'), n('3'), eq])).toBe(true)
    expect(isComplete([n('2'), eq, n('3')])).toBe(false)
  })
})

describe('mainText and secondaryText', () => {
  const base: State = initialState()

  it('show 0 and nothing before anything is typed', () => {
    expect(mainText(base)).toBe('0')
    expect(secondaryText(base)).toBe('')
  })

  it('show the expression while typing and the last answer above it', () => {
    const typing: State = {
      ...base,
      tokens: [n('2'), op('add')],
      entry: '3',
      lastResult: 14,
    }
    expect(mainText(typing)).toBe('2 + 3')
    expect(secondaryText(typing)).toBe('Ans = 14')
  })

  it('show the answer and the evaluated expression after equals', () => {
    const done: State = {
      ...base,
      tokens: [n('2'), op('add'), n('3'), eq],
      lastResult: 5,
    }
    expect(mainText(done)).toBe('5')
    expect(secondaryText(done)).toBe('2 + 3 =')
  })

  it('show the error and the failed expression', () => {
    const failed: State = {
      ...base,
      tokens: [n('1'), op('divide'), n('0')],
      status: 'error',
      error: 'Cannot divide by zero',
    }
    expect(mainText(failed)).toBe('Cannot divide by zero')
    expect(secondaryText(failed)).toBe('1 ÷ 0')
  })
})

describe('toApiTokens', () => {
  it('maps every token kind to the wire format', () => {
    const sent: EvaluationToken[] = [
      { kind: 'number', text: '196', value: 196 },
      { kind: 'unary', op: 'percentage' },
      { kind: 'operator', op: 'multiply' },
      { kind: 'number', text: '5', value: 5 },
    ]
    expect(toApiTokens(sent)).toEqual([
      { type: 'number', value: 196 },
      { type: 'unary', op: 'percentage' },
      { type: 'operator', op: 'multiply' },
      { type: 'number', value: 5 },
    ])
  })
})
