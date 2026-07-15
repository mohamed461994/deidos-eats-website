import { describe, expect, it } from 'vitest'

import { formatKm, haversineKm, normalizeCounty, sameCounty } from './distance'

// The two mock branches, used as a known real-world distance check.
const RANELAGH = { latitude: 53.3267, longitude: -6.2523 }
const CORK = { latitude: 51.8969, longitude: -8.4863 }

describe('haversineKm', () => {
  it('is exactly zero for identical points', () => {
    expect(haversineKm(RANELAGH, RANELAGH)).toBe(0)
  })

  it('measures Ranelagh ↔ Cork at roughly 219 km', () => {
    const km = haversineKm(RANELAGH, CORK)
    expect(km).toBeGreaterThan(215)
    expect(km).toBeLessThan(225)
  })

  it('is symmetric', () => {
    expect(haversineKm(RANELAGH, CORK)).toBeCloseTo(haversineKm(CORK, RANELAGH), 6)
  })
})

describe('formatKm', () => {
  it('shows one decimal below 10 km and whole km at/above', () => {
    expect(formatKm(2.14)).toBe('2.1 km')
    expect(formatKm(9.94)).toBe('9.9 km')
    expect(formatKm(219.3)).toBe('219 km')
    expect(formatKm(10)).toBe('10 km')
  })

  it('never shows a bogus "0 km" up close (town picks sit exactly on branch coords)', () => {
    expect(formatKm(0)).toBe('< 1 km')
    expect(formatKm(0.04)).toBe('< 1 km')
    expect(formatKm(0.94)).toBe('< 1 km')
  })
})

describe('normalizeCounty', () => {
  it('trims, case-folds, and strips a leading Co./County prefix', () => {
    expect(normalizeCounty('Co. Cork')).toBe('cork')
    expect(normalizeCounty('County Dublin')).toBe('dublin')
    expect(normalizeCounty('Co Galway')).toBe('galway')
    expect(normalizeCounty('  cork ')).toBe('cork')
  })

  it('does not strip a county that merely starts with "co"', () => {
    expect(normalizeCounty('Cork')).toBe('cork')
  })

  it('returns empty string for missing values', () => {
    expect(normalizeCounty(null)).toBe('')
    expect(normalizeCounty(undefined)).toBe('')
    expect(normalizeCounty('')).toBe('')
  })
})

describe('sameCounty', () => {
  it('matches despite prefix, case, and whitespace differences', () => {
    expect(sameCounty('Co. Cork', 'cork ')).toBe(true)
    expect(sameCounty('County Dublin', 'dublin')).toBe(true)
  })

  it('is false for different counties or unknown values', () => {
    expect(sameCounty('Dublin', 'Cork')).toBe(false)
    expect(sameCounty('Cork', '')).toBe(false)
    expect(sameCounty(null, 'Cork')).toBe(false)
  })
})
