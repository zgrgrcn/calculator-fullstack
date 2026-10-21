/**
 * Formats a result for the display: 12 significant digits, no trailing
 * zeros, exponent form for very large or very small magnitudes. Hides the
 * binary floating-point noise of results such as 0.1 + 0.2.
 */
export function formatNumber(n: number): string {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e12 || abs < 1e-9) {
    const [mantissa, exponent] = n.toExponential(11).split('e')
    return `${trimZeros(mantissa)}e${exponent}`
  }
  return Number(n.toPrecision(12)).toString()
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}
