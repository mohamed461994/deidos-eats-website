/**
 * Refetch-at-the-promo-boundary hook. Given the `promoEndsAt` instants
 * currently on screen, it fires `onBoundary` the moment the earliest one
 * passes so the caller can invalidate its queries — a "was/now" price never
 * lingers after the promo ended.
 *
 * Background/sleeping tabs are the hard part: browsers clamp and suspend
 * timers, so a laptop reopened an hour later would still show the old price
 * until the next natural refetch. On `visibilitychange` the hook re-checks the
 * wall clock — if a boundary slid past while the tab slept it fires
 * immediately, otherwise it re-arms the timer for the remaining delay.
 */
import { useEffect, useMemo, useRef } from 'react'

import { promoBoundaries } from './promo'

// Never arm further out than this: far boundaries re-check when the capped
// timer fires (staying safely under the 32-bit setTimeout ceiling), near ones
// fire on the boundary itself.
const MAX_ARM_DELAY_MS = 6 * 60 * 60 * 1000
// Small grace so the refetch lands just after the server-side flip, not just before.
const BOUNDARY_GRACE_MS = 250

export function usePromoBoundaryRefresh(
  promoEndsAts: Array<string | null | undefined>,
  onBoundary: () => void,
) {
  // The effect re-arms only when the actual set of boundaries changes, not on
  // every render of the caller (menu/home data objects are new each fetch).
  const boundaryKey = useMemo(
    () => [...new Set(promoEndsAts.filter(Boolean))].sort().join('|'),
    [promoEndsAts],
  )
  const onBoundaryRef = useRef(onBoundary)
  useEffect(() => {
    onBoundaryRef.current = onBoundary
  })

  useEffect(() => {
    if (boundaryKey === '') return
    const instants = boundaryKey.split('|')
    // Fire once per PASSED boundary, not once per set: if a refetch returns
    // unchanged data (server clock a beat behind), the same boundary must not
    // invalidate in a loop, but a later boundary in the same set still fires.
    let firedUpToMs = -Infinity
    let timer: ReturnType<typeof setTimeout> | null = null

    const arm = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      const { lastPassedMs, nextUpcomingMs } = promoBoundaries(instants, Date.now())
      if (lastPassedMs !== null && lastPassedMs > firedUpToMs) {
        firedUpToMs = lastPassedMs
        onBoundaryRef.current()
      }
      if (nextUpcomingMs === null) return
      const delay = Math.min(nextUpcomingMs - Date.now() + BOUNDARY_GRACE_MS, MAX_ARM_DELAY_MS)
      // Re-evaluate on fire rather than blindly invalidating: a capped long
      // delay just re-arms; a real boundary is caught by the `lastPassed` check.
      timer = setTimeout(arm, delay)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') arm()
    }

    arm()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer !== null) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [boundaryKey])
}
