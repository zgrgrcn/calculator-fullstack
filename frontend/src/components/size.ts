/** Display size buckets, largest first; the stylesheet maps each to a font size. */
export const SIZES = [
  'normal',
  'medium',
  'small',
  'compact',
  'tiny',
  'micro',
  'nano',
] as const

export type Size = (typeof SIZES)[number]

/**
 * The largest size at which the text fits, trying the buckets from the
 * largest down, or the smallest size when none fits: the text is then
 * clipped at its start, as an over-long expression always was.
 */
export function fitSize(fits: (size: Size) => boolean): Size {
  return SIZES.find(fits) ?? SIZES[SIZES.length - 1]
}
