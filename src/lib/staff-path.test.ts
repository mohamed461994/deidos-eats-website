import { describe, expect, it } from 'vitest'

import { normalizeStaffSignInPath } from './staff-path'

describe('staff sign-in path configuration', () => {
  it('normalizes a distinct configured path', () => {
    expect(normalizeStaffSignInPath(' /access/night-door/ ')).toBe('/access/night-door')
  })

  it.each(['/signin', '/admin/discounts', '/orders/history', '/r/pizza-king'])(
    'rejects a path that overlaps buyer or admin routing: %s',
    (path) => {
      expect(() => normalizeStaffSignInPath(path)).toThrow(/must not overlap/i)
    },
  )

  it.each(['//other.example/path', '/access//door', '/access/door?token=x'])(
    'rejects a malformed app path: %s',
    (path) => {
      expect(() => normalizeStaffSignInPath(path)).toThrow(/distinct absolute app path/i)
    },
  )
})
