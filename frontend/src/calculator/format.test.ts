import { describe, expect, it } from 'vitest'
import { formatNumber } from './format'

describe('formatNumber', () => {
  it.each([
    [0.1 + 0.2, '0.3'],
    [1 / 3, '0.333333333333'],
    [100 / 3, '33.3333333333'],
    [-0, '0'],
    [0, '0'],
    [2 ** 40, '1.09951162778e+12'],
    [1e-10, '1e-10'],
    [1e21, '1e+21'],
    [123456789, '123456789'],
    [-2.5, '-2.5'],
    [1e-7, '1e-7'],
    [15, '15'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatNumber(input)).toBe(expected)
  })
})
