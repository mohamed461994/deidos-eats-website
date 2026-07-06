/** All amounts are integer euro cents (platform rule) — format only at the edge. */
const formatter = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
})

export function formatCents(cents: number): string {
  return formatter.format(cents / 100)
}

/** "23%" from basis points (2300). Trims trailing .5 only when needed. */
export function formatVatRate(basisPoints: number): string {
  const pct = basisPoints / 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`
}
