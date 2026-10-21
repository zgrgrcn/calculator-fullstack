export type OperationName =
  'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt' | 'percentage'

export interface OperationSpec {
  name: OperationName
  arity: 1 | 2
  symbol: string
}
