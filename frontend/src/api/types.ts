export type OperationName =
  'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt' | 'percentage'

export interface OperationSpec {
  name: OperationName
  arity: 1 | 2
  symbol: string
}

/** One token of POST /api/v1/evaluate, as the backend expects it. */
export type ApiToken =
  | { type: 'number'; value: number }
  | {
      type: 'operator'
      op: 'add' | 'subtract' | 'multiply' | 'divide' | 'power'
    }
  | { type: 'unary'; op: 'sqrt' | 'percentage' }
