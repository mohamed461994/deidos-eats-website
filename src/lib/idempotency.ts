/**
 * Idempotency keys for POST /checkout (required header, 8–200 chars).
 * One key per checkout *attempt set*: generated when the user reaches the pay
 * step and reused across retries of the same order, so a network retry resumes
 * the existing PaymentIntent instead of double-charging.
 */
export function newIdempotencyKey(): string {
  return `web-${crypto.randomUUID()}`
}
