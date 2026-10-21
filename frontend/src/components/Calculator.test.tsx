import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Calculator } from './Calculator'

interface Call {
  operation: string
  operands: number[]
}

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

function compute({ operation, operands }: Call): Response {
  const [a, b] = operands
  switch (operation) {
    case 'add':
      return json({ result: a + b })
    case 'subtract':
      return json({ result: a - b })
    case 'multiply':
      return json({ result: a * b })
    case 'divide':
      return b === 0
        ? json(
            {
              error: {
                code: 'DIVISION_BY_ZERO',
                message: 'cannot divide by zero',
              },
            },
            422,
          )
        : json({ result: a / b })
    case 'power':
      return json({ result: a ** b })
    case 'sqrt':
      return json({ result: Math.sqrt(a) })
    case 'percentage':
      return json({ result: a / 100 })
    default:
      return json(
        { error: { code: 'UNKNOWN_OPERATION', message: 'unknown operation' } },
        400,
      )
  }
}

interface BackendOptions {
  operations?: unknown[]
  handshakeDown?: boolean
  calculateDown?: boolean
}

// Stubs fetch with an in-memory backend that mirrors the Go API.
function fakeBackend({
  operations = ALL_OPERATIONS,
  handshakeDown = false,
  calculateDown = false,
}: BackendOptions = {}) {
  const calls: Call[] = []
  const fetchMock = vi.fn(
    async (url: string, init?: RequestInit): Promise<Response> => {
      if (url.endsWith('/api/v1/operations')) {
        if (handshakeDown) throw new TypeError('Failed to fetch')
        return json({ operations })
      }
      if (url.endsWith('/api/v1/calculate')) {
        if (calculateDown) throw new TypeError('Failed to fetch')
        const body = JSON.parse(String(init?.body)) as Call
        calls.push(body)
        return compute(body)
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
    await tap(user, '1', '2', 'Add', '3', 'Equals')
    await waitFor(() => expect(display().textContent).toBe('15'))
    expect(backend.calls).toEqual([{ operation: 'add', operands: [12, 3] }])
  })

  it('evaluates 2 + 3 × 4 = 14 with operator precedence', async () => {
    const backend = fakeBackend()
    const user = userEvent.setup()
    render(<Calculator />)
    await tap(user, '2', 'Add', '3', 'Multiply', '4', 'Equals')
    await waitFor(() => expect(display().textContent).toBe('14'))
    expect(backend.calls).toEqual([
      { operation: 'multiply', operands: [3, 4] },
      { operation: 'add', operands: [2, 12] },
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
    fakeBackend({ calculateDown: true })
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
    expect(line.textContent).toBe('2 + 3 ×')
    await tap(user, '4', 'Equals')
    await waitFor(() => expect(display().textContent).toBe('14'))
    expect(line.textContent).toBe('2 + 3 × 4 =')
    await tap(user, 'All clear')
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
