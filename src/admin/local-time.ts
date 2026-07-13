interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export class LocalTimeError extends Error {
  readonly code: 'invalid' | 'nonexistent' | 'ambiguous'

  constructor(
    message: string,
    code: 'invalid' | 'nonexistent' | 'ambiguous',
  ) {
    super(message)
    this.name = 'LocalTimeError'
    this.code = code
  }
}

function parseLocalInput(value: string): LocalParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new LocalTimeError('Enter a complete date and time.', 'invalid')
  const [, year, month, day, hour, minute] = match
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  }
  const roundTrip = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  )
  if (
    roundTrip.getUTCFullYear() !== parts.year ||
    roundTrip.getUTCMonth() + 1 !== parts.month ||
    roundTrip.getUTCDate() !== parts.day ||
    roundTrip.getUTCHours() !== parts.hour ||
    roundTrip.getUTCMinutes() !== parts.minute
  ) {
    throw new LocalTimeError('Enter a valid calendar date and time.', 'invalid')
  }
  return parts
}

function formatter(timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    throw new LocalTimeError('This branch has an invalid timezone.', 'invalid')
  }
}

function partsAt(instantMs: number, timezone: string): LocalParts {
  const values = Object.fromEntries(
    formatter(timezone)
      .formatToParts(new Date(instantMs))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  }
}

function sameParts(left: LocalParts, right: LocalParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  )
}

/** Convert a branch-local wall time to one unambiguous UTC instant. */
export function localDateTimeToUtc(value: string, timezone: string): string {
  const target = parseLocalInput(value)
  const wallClockMs = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  )
  const matches: number[] = []

  // Every IANA offset is within UTC-12..UTC+14 and modern offsets align to 15 minutes.
  // Testing each candidate also detects both sides of a DST fall-back overlap.
  for (let offsetMinutes = -12 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = wallClockMs - offsetMinutes * 60_000
    if (sameParts(partsAt(candidate, timezone), target)) matches.push(candidate)
  }

  const uniqueMatches = [...new Set(matches)]
  if (uniqueMatches.length === 0) {
    throw new LocalTimeError(
      'That local time does not exist because the clocks move forward. Choose another time.',
      'nonexistent',
    )
  }
  if (uniqueMatches.length > 1) {
    throw new LocalTimeError(
      'That local time occurs twice because the clocks move back. Choose a different time.',
      'ambiguous',
    )
  }
  return new Date(uniqueMatches[0]).toISOString()
}

export function utcToLocalInput(value: string | null, timezone: string): string {
  if (!value) return ''
  const parts = partsAt(Date.parse(value), timezone)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export function formatBranchDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
