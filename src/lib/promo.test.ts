import { describe, expect, it } from 'vitest'

import { promoBoundaries } from './promo'

const T0 = Date.parse('2026-07-13T12:00:00.000Z')
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString()

describe('promoBoundaries', () => {
  it('returns the soonest FUTURE boundary and the most recent PASSED one', () => {
    const result = promoBoundaries(
      [at(60_000), at(30_000), at(90_000), at(-60_000), at(-10_000)],
      T0,
    )
    expect(result.nextUpcomingMs).toBe(T0 + 30_000)
    expect(result.lastPassedMs).toBe(T0 - 10_000)
  })

  it('ignores nulls, unscheduled promos, and unparseable values', () => {
    expect(promoBoundaries([null, undefined, 'not-a-date'], T0)).toEqual({
      lastPassedMs: null,
      nextUpcomingMs: null,
    })
  })

  it('treats the boundary instant itself as passed (half-open window)', () => {
    expect(promoBoundaries([at(0)], T0)).toEqual({
      lastPassedMs: T0,
      nextUpcomingMs: null,
    })
  })

  it('returns nulls for an empty set', () => {
    expect(promoBoundaries([], T0)).toEqual({ lastPassedMs: null, nextUpcomingMs: null })
  })
})
