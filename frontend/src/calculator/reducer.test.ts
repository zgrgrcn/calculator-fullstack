import { describe, expect, it } from 'vitest'
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

const s0 = initialState()

describe('entry', () => {
  it('appends digits and replaces a leading zero', () => {
    expect(press(s0, '123').display).toBe('123')
    expect(press(s0, '05').display).toBe('5')
  })

  it('handles the decimal point', () => {
    expect(press(s0, '.5').display).toBe('0.5')
    expect(press(s0, '1.2.3').display).toBe('1.23')
  })

  it('caps the entry at MAX_DIGITS digits', () => {
    const s = press(s0, '1234567890123456')
    expect(s.display).toBe('123456789012345')
    expect(s.display).toHaveLength(MAX_DIGITS)
  })

  it('backspace removes the last character and falls back to 0', () => {
    expect(press(s0, '12<').display).toBe('1')
    expect(press(s0, '5<').display).toBe('0')
    expect(press(s0, '5~<').display).toBe('0')
  })

  it('starts a fresh entry after a result', () => {
    const result = resolved(press(s0, '12+3='), 15)
    expect(press(result, '<').display).toBe('15')
    expect(press(result, '7').display).toBe('7')
    expect(press(result, '.').display).toBe('0.')
  })
})

describe('negate', () => {
  it('toggles the sign of the entry', () => {
    expect(press(s0, '5~').display).toBe('-5')
    expect(press(s0, '5~~').display).toBe('5')
    expect(press(s0, '0~').display).toBe('0')
    expect(press(s0, '0.~5').display).toBe('-0.5')
  })

  it('negates a result', () => {
    const s = press(resolved(press(s0, '2+3='), 5), '~')
    expect(s.display).toBe('-5')
    expect(s.value).toBe(-5)
    expect(press(resolved(press(s0, '2-2='), 0), '~').display).toBe('0')
  })

  it('counts as entering the right operand', () => {
    expect(press(s0, '5+~-').request).toMatchObject({
      op: 'add',
      operands: [5, -5],
    })
    expect(press(s0, '5+~*').stack).toEqual([
      { value: 5, op: 'add' },
      { value: -5, op: 'multiply' },
    ])
  })
})

describe('clear', () => {
  it('resets everything except the request counter', () => {
    const s = press(s0, '12+3=')
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
})

describe('operators', () => {
  it('pushes the left operand and keeps the display', () => {
    const s = press(s0, '5+')
    expect(s.stack).toEqual([{ value: 5, op: 'add' }])
    expect(s.display).toBe('5')
    expect(s.awaitingOperand).toBe(true)
    expect(s.request).toBeNull()
  })

  it('replaces the pending operator when another one follows', () => {
    expect(press(s0, '5+*').stack).toEqual([{ value: 5, op: 'multiply' }])
  })

  it('12 + 3 = emits add and shows the result', () => {
    const s = press(s0, '12+3=')
    expect(s.status).toBe('computing')
    expect(s.request).toMatchObject({
      id: 1,
      op: 'add',
      operands: [12, 3],
      after: { kind: 'equals' },
    })
    const done = resolved(s, 15)
    expect(done).toMatchObject({
      display: '15',
      value: 15,
      stack: [],
      status: 'idle',
      entry: null,
      request: null,
    })
  })

  it('equals with nothing pending freezes the entry; repeats do nothing', () => {
    const s = press(s0, '7=')
    expect(s).toMatchObject({ display: '7', entry: null, request: null })
    expect(press(s, '=')).toEqual(s)
  })

  it('uses the displayed value when = follows an operator', () => {
    expect(press(s0, '5+=').request).toMatchObject({
      op: 'add',
      operands: [5, 5],
    })
  })
})

describe('chains with operator precedence', () => {
  it('2 + 3 × 4 = applies × before +', () => {
    let s = press(s0, '2+3*')
    expect(s.request).toBeNull()
    expect(s).toMatchObject({
      stack: [
        { value: 2, op: 'add' },
        { value: 3, op: 'multiply' },
      ],
      display: '3',
    })
    s = press(s, '4=')
    expect(s.request).toMatchObject({
      op: 'multiply',
      operands: [3, 4],
      after: { kind: 'equals' },
    })
    s = resolved(s, 12)
    expect(s.request).toMatchObject({
      op: 'add',
      operands: [2, 12],
      after: { kind: 'equals' },
    })
    expect(resolved(s, 14)).toMatchObject({
      display: '14',
      stack: [],
      status: 'idle',
    })
  })

  it('2 × 3 + 4 = reduces the pending × when + arrives', () => {
    let s = press(s0, '2*3+')
    expect(s.request).toMatchObject({
      op: 'multiply',
      operands: [2, 3],
      after: { kind: 'operator', op: 'add' },
    })
    s = resolved(s, 6)
    expect(s).toMatchObject({
      stack: [{ value: 6, op: 'add' }],
      display: '6',
      request: null,
      awaitingOperand: true,
    })
    s = press(s, '4=')
    expect(s.request).toMatchObject({ op: 'add', operands: [6, 4] })
    expect(resolved(s, 10).display).toBe('10')
  })

  it('8 − 2 − 1 = is left-associative', () => {
    let s = press(s0, '8-2-')
    expect(s.request).toMatchObject({ op: 'subtract', operands: [8, 2] })
    s = press(resolved(s, 6), '1=')
    expect(s.request).toMatchObject({ op: 'subtract', operands: [6, 1] })
    expect(resolved(s, 5).display).toBe('5')
  })

  it('2 ^ 3 ^ 2 = is right-associative', () => {
    let s = press(s0, '2^3^')
    expect(s.request).toBeNull()
    expect(s.stack).toEqual([
      { value: 2, op: 'power' },
      { value: 3, op: 'power' },
    ])
    s = press(s, '2=')
    expect(s.request).toMatchObject({ op: 'power', operands: [3, 2] })
    s = resolved(s, 9)
    expect(s.request).toMatchObject({ op: 'power', operands: [2, 9] })
    expect(resolved(s, 512).display).toBe('512')
  })

  it('AC in the middle of a chain discards the stack', () => {
    expect(press(s0, '2+3*C').stack).toEqual([])
  })
})

describe('unary operations', () => {
  it('send the displayed value and replace it', () => {
    const s = press(s0, '9r')
    expect(s.request).toMatchObject({
      op: 'sqrt',
      operands: [9],
      after: { kind: 'unary' },
    })
    expect(resolved(s, 3)).toMatchObject({
      display: '3',
      value: 3,
      entry: null,
      status: 'idle',
    })
    expect(press(s0, '50%').request).toMatchObject({
      op: 'percentage',
      operands: [50],
    })
  })

  it('leave the pending operator alone: 2 + 9 √ = is 5', () => {
    let s = resolved(press(s0, '2+9r'), 3)
    expect(s.stack).toEqual([{ value: 2, op: 'add' }])
    s = press(s, '=')
    expect(s.request).toMatchObject({ op: 'add', operands: [2, 3] })
    expect(resolved(s, 5).display).toBe('5')
  })
})

describe('failure', () => {
  it('shows the message and recovers on the next digit', () => {
    const s = press(s0, '1/0=')
    const failed = reduce(s, {
      type: 'failed',
      id: s.request!.id,
      message: 'Cannot divide by zero',
    })
    expect(failed).toMatchObject({
      status: 'error',
      display: 'Cannot divide by zero',
      stack: [],
      request: null,
    })
    expect(press(failed, '+')).toBe(failed)
    expect(press(failed, '=')).toBe(failed)
    expect(press(failed, '7')).toMatchObject({ status: 'idle', display: '7' })
    expect(press(failed, 'C').display).toBe('0')
  })

  it('ignores a failure with a stale id', () => {
    const s = press(s0, '1/0=')
    expect(reduce(s, { type: 'failed', id: 99, message: 'x' })).toBe(s)
  })
})

describe('while computing', () => {
  it('ignores every key except AC', () => {
    const s = press(s0, '1+1=')
    expect(press(s, '5')).toBe(s)
    expect(press(s, '+')).toBe(s)
    expect(press(s, 'r')).toBe(s)
    expect(press(s, 'C').status).toBe('idle')
  })

  it('ignores a result with a mismatched id', () => {
    const s = press(s0, '1+1=')
    expect(reduce(s, { type: 'resolved', id: 42, value: 2 })).toBe(s)
  })
})
