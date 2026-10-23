import { describe, expect, it } from 'vitest'
import { SIZES, fitSize } from './size'
import type { Size } from './size'

/** Width of one piece of text at each bucket, in px, as a measurer would report. */
const WIDTHS: Record<Size, number> = {
  normal: 560,
  medium: 480,
  small: 400,
  compact: 320,
  tiny: 256,
  micro: 192,
  nano: 160,
}

const fitsIn = (available: number) => (size: Size) => WIDTHS[size] <= available

describe('fitSize', () => {
  it('lists the buckets largest first', () => {
    expect(SIZES).toEqual([
      'normal',
      'medium',
      'small',
      'compact',
      'tiny',
      'micro',
      'nano',
    ])
  })

  it.each([
    [1000, 'normal'],
    [560, 'normal'],
    [559, 'medium'],
    [480, 'medium'],
    [479, 'small'],
    [400, 'small'],
    [399, 'compact'],
    [320, 'compact'],
    [319, 'tiny'],
    [256, 'tiny'],
    [255, 'micro'],
    [192, 'micro'],
    [191, 'nano'],
    [160, 'nano'],
  ] as const)('with %i px available picks %s', (available, size) => {
    expect(fitSize(fitsIn(available))).toBe(size)
  })

  it('falls back to the smallest bucket when nothing fits', () => {
    expect(fitSize(fitsIn(159))).toBe('nano')
    expect(fitSize(() => false)).toBe('nano')
  })

  it('stops measuring at the first bucket that fits', () => {
    const tried: Size[] = []
    fitSize((size) => {
      tried.push(size)
      return size === 'small'
    })
    expect(tried).toEqual(['normal', 'medium', 'small'])
  })
})
