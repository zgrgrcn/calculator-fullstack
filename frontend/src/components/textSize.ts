/**
 * Size bucket for a line of calculator text. CSS attribute selectors cannot
 * compare numbers, so the bucket is computed here and styled by name.
 */
export function sizeFor(text: string): 'normal' | 'small' | 'tiny' {
  if (text.length <= 9) return 'normal'
  if (text.length <= 14) return 'small'
  return 'tiny'
}
