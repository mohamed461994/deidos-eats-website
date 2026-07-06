import { describe, expect, it } from 'vitest'

import { isValidEircode, normalizeEircode } from './eircode'

describe('isValidEircode', () => {
  it('accepts valid Eircodes with and without the space', () => {
    expect(isValidEircode('D02 AF30')).toBe(true)
    expect(isValidEircode('D02AF30')).toBe(true)
    expect(isValidEircode('t12 x2fp')).toBe(true)
  })

  it('rejects obviously wrong values', () => {
    expect(isValidEircode('')).toBe(false)
    expect(isValidEircode('12345')).toBe(false)
    expect(isValidEircode('SW1A 1AA')).toBe(false)
  })
})

describe('normalizeEircode', () => {
  it('uppercases and inserts the canonical space', () => {
    expect(normalizeEircode('d02af30')).toBe('D02 AF30')
    expect(normalizeEircode(' D02 AF30 ')).toBe('D02 AF30')
  })
})
