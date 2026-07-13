/**
 * Online-promo boundary helper. A promo's `promoEndsAt` is an absolute server
 * instant (half-open: the promo applies up to but not including it), so the UI
 * can refetch exactly when a "was/now" price stops being true instead of
 * showing a stale discount until the next natural refetch.
 */

export interface PromoBoundaries {
  /** The most recent boundary at or before `nowMs`, or null when none passed yet. */
  lastPassedMs: number | null
  /** The soonest boundary after `nowMs` — the next moment prices change — or null. */
  nextUpcomingMs: number | null
}

/**
 * One pass over the visible `promoEndsAt` instants: what already expired (so
 * a caller can fire once per passed boundary) and what expires next (so it
 * can arm a timer). Nulls, unscheduled promos, and unparseable values are
 * ignored; a boundary exactly at `nowMs` counts as passed (half-open window).
 */
export function promoBoundaries(
  promoEndsAts: Iterable<string | null | undefined>,
  nowMs: number,
): PromoBoundaries {
  let lastPassedMs: number | null = null
  let nextUpcomingMs: number | null = null
  for (const instant of promoEndsAts) {
    if (!instant) continue
    const ms = Date.parse(instant)
    if (Number.isNaN(ms)) continue
    if (ms <= nowMs) {
      if (lastPassedMs === null || ms > lastPassedMs) lastPassedMs = ms
    } else if (nextUpcomingMs === null || ms < nextUpcomingMs) {
      nextUpcomingMs = ms
    }
  }
  return { lastPassedMs, nextUpcomingMs }
}
