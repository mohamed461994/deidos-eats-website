import { describe, expect, it } from 'vitest'

import { formatCents, formatVatRate } from './money'

describe('formatCents', () => {
  it('formats integer euro cents as euro amounts', () => {
    expect(formatCents(1250)).toBe('€12.50')
    expect(formatCents(0)).toBe('€0.00')
    expect(formatCents(299)).toBe('€2.99')
  })
})

describe('formatVatRate', () => {
  it('renders basis points as percentages', () => {
    expect(formatVatRate(2300)).toBe('23%')
    expect(formatVatRate(1350)).toBe('13.5%')
    expect(formatVatRate(0)).toBe('0%')
  })
})
