import { describe, expect, it } from 'vitest'

import { LocalTimeError, localDateTimeToUtc, utcToLocalInput } from './local-time'

describe('branch-local promo time conversion', () => {
  it('converts an ordinary Dublin wall time to an absolute UTC instant', () => {
    expect(localDateTimeToUtc('2026-07-13T12:00', 'Europe/Dublin')).toBe(
      '2026-07-13T11:00:00.000Z',
    )
    expect(utcToLocalInput('2026-07-13T11:00:00.000Z', 'Europe/Dublin')).toBe(
      '2026-07-13T12:00',
    )
  })

  it('rejects a nonexistent spring-forward wall time', () => {
    expect(() => localDateTimeToUtc('2026-03-29T01:30', 'Europe/Dublin')).toThrowError(
      expect.objectContaining<Partial<LocalTimeError>>({ code: 'nonexistent' }),
    )
  })

  it('rejects an ambiguous fall-back wall time', () => {
    expect(() => localDateTimeToUtc('2026-10-25T01:30', 'Europe/Dublin')).toThrowError(
      expect.objectContaining<Partial<LocalTimeError>>({ code: 'ambiguous' }),
    )
  })
})
