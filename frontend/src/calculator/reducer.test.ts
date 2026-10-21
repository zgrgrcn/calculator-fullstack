import { describe, expect, it } from 'vitest'
import { mainText, secondaryText } from './expression'
import { MAX_DIGITS, initialState, reduce } from './reducer'
import type { Digit, Key, State } from './types'

// Compact key notation for readable sequences:
// digits and '.', + - * / ^ for operators, = equals, % percent, r sqrt,
// ~ negate, < backspace, C all clear.
function keys(text: string): Key[] {
  return [...text].map((ch): Key => {
    if (ch >= '0' && ch <= '9') return { type: 'digit', value: ch as Digit }
    switch (ch) {
      case '.':
        return { type: 'decimal' }
      case '+':
        return { type: 'operator', op: 'add' }
      case '-':
        return { type: 'operator', op: 'subtract' }
      case '*':
        return { type: 'operator', op: 'multiply' }
      case '/':
        return { type: 'operator', op: 'divide' }
      case '^':
        return { type: 'operator', op: 'power' }
      case '=':
        return { type: 'equals' }
      case '%':
        return { type: 'unary', op: 'percentage' }
      case 'r':
        return { type: 'unary', op: 'sqrt' }
      case '~':
        return { type: 'negate' }
      case '<':
        return { type: 'backspace' }
      case 'C':
        return { type: 'clear' }
      default:
        throw new Error(`no key for ${ch}`)
    }
  })
}

function press(state: State, text: string): State {
  return keys(text).reduce((s, key) => reduce(s, { type: 'key', key }), state)
}

function resolved(state: State, value: number): State {
  if (!state.request) throw new Error('no request in flight')
  return reduce(state, { type: 'resolved', id: state.request.id, value })
}

const big = (s: State) => mainText(s)
const small = (s: State) => secondaryText(s)
const sent = (s: State) =>
  s.request?.tokens.map((t) =>
    t.kind === 'number' ? t.value : t.kind === 'operator' ? t.op : `${t.op}()`,
  )
const s0 = initialState()

describe('entry', () => {
  it('appends digits and replaces a leading zero', () => {
    expect(big(press(s0, '123'))).toBe('123')
    expect(big(press(s0, '05'))).toBe('5')
  })

  it('handles the decimal point', () => {
    expect(big(press(s0, '.5'))).toBe('0.5')
    expect(big(press(s0, '1.2.3'))).toBe('1.23')
  })

  it('caps the entry at MAX_DIGITS digits', () => {
    const s = press(s0, '1234567890123456')
    expect(big(s)).toHaveLength(MAX_DIGITS)
  })

  it('backspace edits the entry, then removes committed tokens', () => {
    expect(big(press(s0, '12<'))).toBe('1')
    expect(big(press(s0, '5<'))).toBe('0')
    expect(big(press(s0, '12+3<'))).toBe('12 +')
    expect(big(press(s0, '12+<'))).toBe('12')
    expect(big(press(s0, '12+<<'))).toBe('0')
    expect(press(s0, '12+<<<')).toEqual(press(s0, '12+<<'))
  })
})

describe('building the expression', () => {
  it('operators only append; nothing is sent', () => {
    const s = press(s0, '2+3*')
    expect(big(s)).toBe('2 + 3 ×')
    expect(small(s)).toBe('')
    expect(s.request).toBeNull()
    expect(s.status).toBe('idle')
    expect(big(press(s, '4'))).toBe('2 + 3 × 4')
  })

  it('a second operator replaces a trailing one', () => {
    expect(big(press(s0, '5+*'))).toBe('5 ×')
  })

  it('an operator before any number starts from 0', () => {
    expect(big(press(s0, '+5'))).toBe('0 + 5')
  })

  it('unary keys wrap the operand and stay in the expression', () => {
    expect(big(press(s0, '196%'))).toBe('196%')
    expect(big(press(s0, '196%*5'))).toBe('196% × 5')
    expect(big(press(s0, '9r'))).toBe('√(9)')
    expect(big(press(s0, '81rr'))).toBe('√(√(81))')
    expect(big(press(s0, '2+9r'))).toBe('2 + √(9)')
  })

  it('ignores digits after a closed operand and unary keys with nothing to apply to', () => {
    expect(big(press(s0, '196%5'))).toBe('196%')
    expect(big(press(s0, '2+r'))).toBe('2 +')
    expect(big(press(s0, 'r'))).toBe('0')
  })

  it('negate toggles the sign of the entry only', () => {
    expect(big(press(s0, '5~'))).toBe('-5')
    expect(big(press(s0, '5~~'))).toBe('5')
    expect(big(press(s0, '0~'))).toBe('0')
    expect(big(press(s0, '5+~'))).toBe('5 +')
    expect(big(press(s0, '5+~3'))).toBe('5 + 3')
  })
})

describe('equals', () => {
  it('sends the whole expression once and shows the answer', () => {
    const s = press(s0, '2+3*4=')
    expect(s.status).toBe('computing')
    expect(sent(s)).toEqual([2, 'add', 3, 'multiply', 4])
    expect(big(s)).toBe('2 + 3 × 4')
    const done = resolved(s, 14)
    expect(done.status).toBe('idle')
    expect(done.lastResult).toBe(14)
    expect(big(done)).toBe('14')
    expect(small(done)).toBe('2 + 3 × 4 =')
  })

  it('sends postfix unary tokens', () => {
    expect(sent(press(s0, '196%*5='))).toEqual([
      196,
      'percentage()',
      'multiply',
      5,
    ])
  })

  it('is ignored on an empty or unfinished expression and when repeated', () => {
    expect(press(s0, '=')).toEqual(s0)
    const trailing = press(s0, '5+=')
    expect(trailing.request).toBeNull()
    expect(big(trailing)).toBe('5 +')
    const done = resolved(press(s0, '2+3='), 5)
    expect(press(done, '=')).toEqual(done)
  })

  it('after an answer: a digit starts fresh under Ans, an operator or unary continues from the answer', () => {
    const done = resolved(press(s0, '2+3='), 5)
    const fresh = press(done, '7')
    expect(big(fresh)).toBe('7')
    expect(small(fresh)).toBe('Ans = 5')
    expect(big(press(done, '+'))).toBe('5 +')
    expect(sent(press(done, '+2='))).toEqual([5, 'add', 2])
    expect(big(press(done, 'r'))).toBe('√(5)')
    expect(big(press(done, '~'))).toBe('-5')
    expect(big(press(done, '<'))).toBe('5')
  })

  it('keeps the answer value exact when continuing', () => {
    const done = resolved(press(s0, '1/3='), 1 / 3)
    expect(big(done)).toBe('0.333333333333')
    const next = press(done, '*3=')
    expect(sent(next)).toEqual([1 / 3, 'multiply', 3])
    expect(big(next)).toBe('0.333333333333 × 3')
  })
})

describe('failure', () => {
  it('shows the message with the failed expression and recovers on the next digit or AC', () => {
    const s = press(s0, '1/0=')
    const failed = reduce(s, {
      type: 'failed',
      id: s.request!.id,
      message: 'Cannot divide by zero',
    })
    expect(failed.status).toBe('error')
    expect(big(failed)).toBe('Cannot divide by zero')
    expect(small(failed)).toBe('1 ÷ 0')
    expect(press(failed, '+')).toBe(failed)
    expect(press(failed, '=')).toBe(failed)
    const fresh = press(failed, '7')
    expect(fresh.status).toBe('idle')
    expect(big(fresh)).toBe('7')
    expect(big(press(failed, 'C'))).toBe('0')
  })

  it('ignores a failure with a stale id', () => {
    const s = press(s0, '1/0=')
    expect(reduce(s, { type: 'failed', id: 99, message: 'x' })).toBe(s)
  })
})

describe('clear and computing', () => {
  it('AC resets everything except the request counter', () => {
    const s = resolved(press(s0, '12+3='), 15)
    expect(press(s, 'C')).toEqual({
      ...initialState(),
      nextRequestId: s.nextRequestId,
    })
  })

  it('drops a response that arrives after AC', () => {
    const s = press(s0, '12+3=')
    const cleared = press(s, 'C')
    expect(
      reduce(cleared, { type: 'resolved', id: s.request!.id, value: 15 }),
    ).toBe(cleared)
  })

  it('ignores every key except AC while computing, and results with a mismatched id', () => {
    const s = press(s0, '1+1=')
    expect(press(s, '5')).toBe(s)
    expect(press(s, '+')).toBe(s)
    expect(press(s, 'r')).toBe(s)
    expect(press(s, 'C').status).toBe('idle')
    expect(reduce(s, { type: 'resolved', id: 42, value: 2 })).toBe(s)
  })
})

describe('insert', () => {
  it('starts a new expression from an inserted value and continues from it', () => {
    const inserted = reduce(resolved(press(s0, '2+3='), 5), {
      type: 'insert',
      value: 1 / 3,
    })
    expect(big(inserted)).toBe('0.333333333333')
    expect(small(inserted)).toBe('Ans = 5')
    expect(inserted.status).toBe('idle')
    const next = press(inserted, '*3=')
    expect(sent(next)).toEqual([1 / 3, 'multiply', 3])
  })

  it('replaces a half-typed expression and an error, but is ignored while computing', () => {
    expect(big(reduce(press(s0, '12+'), { type: 'insert', value: 7 }))).toBe(
      '7',
    )
    const s = press(s0, '1/0=')
    const failed = reduce(s, {
      type: 'failed',
      id: s.request!.id,
      message: 'Cannot divide by zero',
    })
    expect(big(reduce(failed, { type: 'insert', value: 7 }))).toBe('7')
    const computing = press(s0, '1+1=')
    expect(reduce(computing, { type: 'insert', value: 7 })).toBe(computing)
  })
})
