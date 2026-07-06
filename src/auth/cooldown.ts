/** Client-side throttle for the "Resend code" button. */
export const RESEND_COOLDOWN_SECONDS = 30

/**
 * Whole seconds left in a cooldown that began at `startedAt`, evaluated at `now`
 * (both epoch ms). Returns 0 when there is no active cooldown or it has elapsed.
 */
export function cooldownRemaining(
  startedAt: number | null,
  now: number,
  seconds = RESEND_COOLDOWN_SECONDS,
): number {
  if (startedAt === null) return 0
  const elapsed = Math.floor((now - startedAt) / 1000)
  return Math.max(0, seconds - elapsed)
}
