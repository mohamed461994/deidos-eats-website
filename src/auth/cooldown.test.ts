import { describe, expect, it } from 'vitest'

import { cooldownRemaining, RESEND_COOLDOWN_SECONDS } from './cooldown'

describe('cooldownRemaining', () => {
  it('is 0 when no cooldown is active', () => {
    expect(cooldownRemaining(null, 1_000)).toBe(0)
  })

  it('returns the full duration at the moment it starts', () => {
    expect(cooldownRemaining(1_000, 1_000)).toBe(RESEND_COOLDOWN_SECONDS)
  })

  it('counts down in whole seconds as time passes', () => {
    const start = 1_000
    expect(cooldownRemaining(start, start + 5_000)).toBe(RESEND_COOLDOWN_SECONDS - 5)
    // floor(29.4s) = 29 elapsed → 1 second left
    expect(cooldownRemaining(start, start + 29_400)).toBe(1)
  })

  it('clamps to 0 once the cooldown has elapsed', () => {
    expect(cooldownRemaining(1_000, 1_000 + 60_000)).toBe(0)
  })

  it('honours a custom duration', () => {
    expect(cooldownRemaining(0, 2_000, 10)).toBe(8)
  })
})
