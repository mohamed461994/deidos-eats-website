/**
 * Client-side Eircode check mirroring the contract's `Eircode` pattern
 * (routing key + 4-char unique identifier, e.g. "D02 AF30"). The API is the
 * source of truth — this exists only to catch typos before submit.
 */
const EIRCODE_RE = /^[AC-FHKNPRTV-Y][0-9]{2}\s?[AC-FHKNPRTV-Y0-9]{4}$/i

export function isValidEircode(value: string): boolean {
  return EIRCODE_RE.test(value.trim())
}

export function normalizeEircode(value: string): string {
  const compact = value.trim().toUpperCase().replace(/\s+/g, '')
  return compact.length === 7 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : compact.toUpperCase()
}
