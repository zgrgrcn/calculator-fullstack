import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Calculator } from './Calculator'

type Call = Array<{ type: string; value?: number; op?: string }>

const ALL_OPERATIONS = [
  { name: 'add', arity: 2, symbol: '+' },
  { name: 'subtract', arity: 2, symbol: '−' },
  { name: 'multiply', arity: 2, symbol: '×' },
  { name: 'divide', arity: 2, symbol: '÷' },
  { name: 'power', arity: 2, symbol: '^' },
  { name: 'sqrt', arity: 1, symbol: '√' },
  { name: 'percentage', arity: 1, symbol: '%' },
]

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

class DivisionByZero extends Error {}

// A tiny precedence-climbing evaluator for the fake backend; test code only.
function evaluateTokens(tokens: Call): number {
  const precedence: Record<string, number> = {
    add: 1,
    subtract: 1,
    multiply: 2,
    divide: 2,
    power: 3,
  }
  let pos = 0
  const operand = (): number => {
    let value = tokens[pos++].value ?? NaN
    while (tokens[pos]?.type === 'unary') {
      value = tokens[pos].op === 'sqrt' ? Math.sqrt(value) : value / 100
      pos++
    }
    return value
  }
  const expression = (min: number): number => {
    let left = operand()
    while (pos < tokens.length) {
      const op = tokens[pos].op ?? ''
      const prec = precedence[op]
      if (prec < min) break
      pos++
      const right = expression(op === 'power' ? prec : prec + 1)
      if (op === 'add') left += right
      else if (op === 'subtract') left -= right
      else if (op === 'multiply') left *= right
      else if (op === 'divide') {
        if (right === 0) throw new DivisionByZero()
        left /= right
      } else left **= right
    }
    return left
  }
  return expression(1)
}

interface BackendOptions {
  operations?: unknown[]
  handshakeDown?: boolean
  evaluateDown?: boolean
}

// Stubs fetch with an in-memory backend that mirrors the Go API.
function fakeBackend({
  operations = ALL_OPERATIONS,
  handshakeDown = false,
  evaluateDown = false,
}: BackendOptions = {}) {
  const calls: Call[] = []
  const fetchMock = vi.fn(
    async (url: string, init?: RequestInit): Promise<Response> => {
      if (url.endsWith('/api/v1/operations')) {
        if (handshakeDown) throw new TypeError('Failed to fetch')
        return json({ operations })
      }
      if (url.endsWith('/api/v1/evaluate')) {
        if (evaluateDown) throw new TypeError('Failed to fetch')
        const { tokens } = JSON.parse(String(init?.body)) as { tokens: Call }
        calls.push(tokens)
        try {
          return json({ result: evaluateTokens(tokens) })
        } catch (err) {
          if (err instanceof DivisionByZero)
            return json(
              {
                error: {
                  code: 'DIVISION_BY_ZERO',
                  message: 'cannot divide by zero',
                },
              },
              422,
            )
          throw err
        }
      }
      throw new Error(`unexpected request to ${url}`)
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

const display = () => screen.getByRole('status')
const button = (name: string) => screen.getByRole('button', { name })

async function tap(
  user: ReturnType<typeof userEvent.setup>,
  ...names: string[]
) {
  for (const name of names) await user.click(button(name))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Calculator', () => {
  it('computes 12 + 3 = 15 through the API', async () => {
    const backend = fakeBackend()
    const user = userEvent.setup()
    render(<Calculator />)
    await tap(user, '1', '2', 'Add', '3')
    expect(display().textContent).toBe('12 + 3')
    expect(backend.calls).toEqual([])
    await tap(user, 'Equals')
    await waitFor(() => expect(display().textContent).toBe('15'))
    expect(backend.calls).toEqual([
      [
        { type: 'number', value: 12 },
        { type: 'operator', op: 'add' },
        { type: 'number', value: 3 },
      ],
    ])
  })

  it('evaluates 2 + 3 × 4 = 14 in a single request', async () => {
    const backend = fakeBackend()
    const user = userEvent.setup()
    render(<Calculator />)
    await tap(user, '2', 'Add', '3', 'Multiply', '4', 'Equals')
    await waitFor(() => expect(display().textContent).toBe('14'))
    expect(backend.calls).toHaveLength(1)
    expect(backend.calls[0].map((t) => t.value ?? t.op)).toEqual([
      2,
      'add',
      3,
      'multiply',
      4,
    ])
  })

  it('shows the backend error for division by zero and recovers with AC', async () => {
    fakeBackend()
    const user = userEvent.setup()
    render(<Calculator />)
    await tap(user, '1', 'Divide', '0', 'Equals')
    await waitFor(() =>
      expect(display().textContent).toBe('Cannot divide by zero'),
    )
    expect(display()).toHaveAttribute('data-error', 'true')
    await tap(user, 'All clear')
    expect(display().textContent).toBe('0')
    expect(display()).not.toHaveAttribute('data-error')
  })

  it('reports an unreachable backend', async () => {
    fakeBackend({ evaluateDown: true })
    const user = userEvent.setup()
    render(<Calculator />)
    await tap(user, '1', 'Add', '1', 'Equals')
    await waitFor(() =>
      expect(display().textContent).toBe('Backend unreachable'),
    )
  })

  it('accepts keyboard input', async () => {
    fakeBackend()
    const user = userEvent.setup()
    render(<Calculator />)
    await user.keyboard('12+3{Enter}')
    await waitFor(() => expect(display().textContent).toBe('15'))
    await user.keyboard('{Escape}')
    expect(display().textContent).toBe('0')
    await user.keyboard('9s')
    expect(display().textContent).toBe('√(9)')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(display().textContent).toBe('3'))
  })

  it('disables the keypad while a request is pending, except AC', async () => {
    let release!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/api/v1/operations')
          ? json({ operations: ALL_OPERATIONS })
          : pending,
      ),
    )
    const user = userEvent.setup()
    render(<Calculator />)
    await tap(user, '1', 'Add', '1', 'Equals')
    const keypad = button('7').parentElement
    expect(keypad).toHaveAttribute('aria-busy', 'true')
    expect(button('7')).toBeDisabled()
    expect(button('All clear')).toBeEnabled()
    release(json({ result: 2 }))
    await waitFor(() => expect(display().textContent).toBe('2'))
    expect(keypad).toHaveAttribute('aria-busy', 'false')
    expect(button('7')).toBeEnabled()
  })

  it('disables operations the backend does not advertise', async () => {
    fakeBackend({
      operations: ALL_OPERATIONS.filter((op) => op.name !== 'power'),
    })
    render(<Calculator />)
    await waitFor(() => expect(button('Power')).toBeDisabled())
    expect(button('Power')).toHaveAttribute(
      'title',
      'Not supported by the backend',
    )
    expect(button('Multiply')).toBeEnabled()
    expect(button('Square root')).toBeEnabled()
  })

  it('shows a status line when the handshake fails and Retry clears it', async () => {
    const backend = fakeBackend({ handshakeDown: true })
    const user = userEvent.setup()
    render(<Calculator />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Backend unreachable')
    expect(button('Add')).toBeEnabled()
    backend.fetchMock.mockImplementation(async () =>
      json({ operations: ALL_OPERATIONS }),
    )
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    )
  })
})

describe('expression line', () => {
  it('shows what was pressed above the display, before and after =', async () => {
    fakeBackend()
    const user = userEvent.setup()
    render(<Calculator />)
    const line = screen.getByTestId('expression')
    expect(line.textContent).toBe('')
    await tap(user, '2', 'Add', '3', 'Multiply')
    expect(display().textContent).toBe('2 + 3 ×')
    expect(line.textContent).toBe('')
    await tap(user, '4', 'Equals')
    await waitFor(() => expect(display().textContent).toBe('14'))
    expect(line.textContent).toBe('2 + 3 × 4 =')
    await tap(user, '7')
    expect(display().textContent).toBe('7')
    expect(line.textContent).toBe('Ans = 14')
    await tap(user, 'All clear')
    expect(display().textContent).toBe('0')
    expect(line.textContent).toBe('')
  })

  it('marks a finished result for the CSS animation and clears the mark after', async () => {
    fakeBackend()
    const user = userEvent.setup()
    render(<Calculator />)
    const line = screen.getByTestId('expression')
    await tap(user, '2', 'Add', '3', 'Multiply', '4', 'Equals')
    await waitFor(() => expect(display().textContent).toBe('14'))
    expect(line).toHaveAttribute('data-complete', 'true')
    expect(display()).toHaveAttribute('data-result', 'true')
    expect(line).toHaveAttribute('data-size', 'normal')

    await tap(user, '7')
    expect(line).not.toHaveAttribute('data-complete')
    expect(display()).not.toHaveAttribute('data-result')

    await tap(user, 'All clear', '5', 'Add', '3', 'Equals')
    await waitFor(() => expect(display().textContent).toBe('8'))
    expect(line).toHaveAttribute('data-complete', 'true')
    expect(display()).toHaveAttribute('data-result', 'true')

    await tap(user, 'Add')
    expect(line).not.toHaveAttribute('data-complete')
    expect(display()).not.toHaveAttribute('data-result')
  })
})

describe('history', () => {
  it('lists finished expressions newest first in a dropdown, inserts a clicked result, and closes on outside click, Escape and the × icon', async () => {
    localStorage.removeItem('calculator.history')
    fakeBackend()
    const user = userEvent.setup()
    const firstLoad = render(<Calculator />)
    await tap(user, '1', '2', 'Add', '3', 'Equals')
    await waitFor(() => expect(display().textContent).toBe('15'))
    await tap(user, '2', 'Multiply', '4', 'Equals')
    await waitFor(() => expect(display().textContent).toBe('8'))

    await user.click(button('History'))
    const dialog = screen.getByRole('dialog', { name: 'History' })
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['2 × 4 = 8', '12 + 3 = 15'])
    expect(
      JSON.parse(localStorage.getItem('calculator.history') ?? '[]'),
    ).toHaveLength(2)

    // Escape closes the dropdown without clearing the calculator.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(display().textContent).toBe('8')

    // A click outside closes it too.
    await user.click(button('History'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(display())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Clicking a result inserts it as the start of a new expression and closes the dropdown.
    await user.click(button('History'))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '12 + 3 = 15',
      }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(display().textContent).toBe('15')
    await tap(user, 'Add', '5', 'Equals')
    await waitFor(() => expect(display().textContent).toBe('20'))

    // The list survives a reload and the broom clears it.
    firstLoad.unmount()
    render(<Calculator />)
    await user.click(button('History'))
    expect(
      within(screen.getByRole('dialog')).getAllByRole('listitem'),
    ).toHaveLength(3)
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Clear history',
      }),
    )
    expect(screen.getByText('No calculations yet')).toBeInTheDocument()
    expect(localStorage.getItem('calculator.history')).toBe('[]')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('key press feedback', () => {
  it('marks the pressed key for the CSS animation on clicks and on keyboard input, alternating so repeats replay', async () => {
    fakeBackend()
    const user = userEvent.setup()
    render(<Calculator />)
    expect(button('7')).not.toHaveAttribute('data-pressed')
    await user.keyboard('7')
    expect(button('7')).toHaveAttribute('data-pressed', '1')
    await user.keyboard('7')
    expect(button('7')).toHaveAttribute('data-pressed', '0')
    await user.click(button('Add'))
    expect(button('Add')).toHaveAttribute('data-pressed', '1')
    expect(button('7')).toHaveAttribute('data-pressed', '0')
    expect(display().textContent).toBe('77 +')
  })
})
