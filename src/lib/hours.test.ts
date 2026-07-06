import { describe, expect, it } from 'vitest'

import { formatTime, hoursByDay } from './hours'

describe('formatTime', () => {
  it('converts 24h HH:MM to friendly labels', () => {
    expect(formatTime('12:00')).toBe('12pm')
    expect(formatTime('09:30')).toBe('9:30am')
    expect(formatTime('23:30')).toBe('11:30pm')
    expect(formatTime('00:00')).toBe('12am')
  })
})

describe('hoursByDay', () => {
  it('groups split shifts under one weekday in order', () => {
    const rows = hoursByDay([
      { weekday: 4, opensAt: '17:00', closesAt: '23:00' },
      { weekday: 4, opensAt: '12:00', closesAt: '15:00' },
    ])
    const friday = rows.find((r) => r.day === 'Friday')!
    expect(friday.ranges).toEqual(['12pm – 3pm', '5pm – 11pm'])
    expect(rows.find((r) => r.day === 'Monday')!.ranges).toEqual([])
  })
})
