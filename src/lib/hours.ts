import type { OpeningHour } from '@/api/types'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? ''
}

/** "12:30" → "12:30pm" style label. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, '0')}${suffix}`
}

/**
 * Group a branch's opening hours (contract weekday: 0=Monday … 6=Sunday,
 * possibly several rows per day for split shifts) into display rows.
 */
export function hoursByDay(hours: OpeningHour[]): { day: string; ranges: string[] }[] {
  return WEEKDAYS.map((day, weekday) => {
    const ranges = hours
      .filter((h) => h.weekday === weekday)
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt))
      .map((h) => `${formatTime(h.opensAt)} – ${formatTime(h.closesAt)}`)
    return { day, ranges }
  })
}
