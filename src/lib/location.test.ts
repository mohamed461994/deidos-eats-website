import { beforeEach, describe, expect, it } from 'vitest'

import { restaurantA, restaurantB } from '@/api/mock/data'

import {
  clearHomeLocation,
  HOME_LOCATION_KEY,
  roundCoordinate,
  setHomeLocation,
  townOptions,
} from './location'

beforeEach(() => localStorage.clear())

describe('roundCoordinate', () => {
  it('rounds to 3 decimals (~110 m) so precise fixes never persist', () => {
    expect(roundCoordinate(53.3267891)).toBe(53.327)
    expect(roundCoordinate(-6.2523456)).toBe(-6.252)
    expect(roundCoordinate(0)).toBe(0)
  })
})

describe('home location storage', () => {
  it('persists a rounded location and clears it again', () => {
    setHomeLocation({ kind: 'coords', latitude: 53.3267891, longitude: -6.2523456 })
    const stored = JSON.parse(localStorage.getItem(HOME_LOCATION_KEY)!) as Record<string, unknown>
    // Rounded BEFORE storage — full precision is never written anywhere.
    expect(stored).toEqual({ kind: 'coords', latitude: 53.327, longitude: -6.252 })

    clearHomeLocation()
    expect(localStorage.getItem(HOME_LOCATION_KEY)).toBeNull()
  })

  it('keeps the picked town label alongside its anchor coordinates', () => {
    setHomeLocation({ kind: 'town', town: 'Galway', latitude: 53.2707, longitude: -9.0568 })
    const stored = JSON.parse(localStorage.getItem(HOME_LOCATION_KEY)!) as Record<string, unknown>
    expect(stored).toEqual({ kind: 'town', town: 'Galway', latitude: 53.271, longitude: -9.057 })
  })
})

describe('townOptions', () => {
  const feedBranches = [...restaurantA.branches, ...restaurantB.branches]

  it('derives unique towns with coordinates from live branch data, alphabetically', () => {
    const towns = townOptions(feedBranches)
    expect(towns.map((t) => t.town)).toEqual(['Cork', 'Galway', 'Ranelagh, Dublin 6'])
    const galway = towns.find((t) => t.town === 'Galway')!
    expect(galway.latitude).toBeCloseTo(53.271, 3)
    expect(galway.longitude).toBeCloseTo(-9.057, 3)
  })

  it('skips branches without coordinates and dedupes case-insensitively', () => {
    const galway = restaurantB.branches[0]
    const towns = townOptions([
      { ...galway, latitude: null, longitude: null },
      { ...galway, town: 'galway' },
    ])
    // The coordinate-less entry is skipped; the lowercase duplicate wins once.
    expect(towns.map((t) => t.town)).toEqual(['galway'])
  })

  it('returns nothing while the feed is still loading', () => {
    expect(townOptions(undefined)).toEqual([])
  })
})
