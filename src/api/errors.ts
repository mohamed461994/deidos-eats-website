import type { ApiErrorBody } from './types'

/** Typed error thrown by both the live client and the mock API. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.details = body.details as Record<string, unknown> | undefined
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  if (!(error instanceof ApiError)) return false
  return code === undefined || error.code === code
}

/** Buyer-facing copy for known failure codes; falls back to a safe generic line. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'branch_closed':
        return 'This branch is closed right now — check the opening hours below.'
      case 'items_unavailable':
        return 'Something in your order just sold out. Review your cart and try again.'
      case 'below_minimum_order':
        return 'Your order is below the delivery minimum for this branch.'
      case 'outside_delivery_radius':
        return "That address is outside this branch's delivery area."
      case 'order_not_cancellable':
        return 'The kitchen has already accepted this order, so it can no longer be cancelled.'
      case 'validation_failed':
        return 'Some details look off — check the highlighted fields.'
      default:
        break
    }
    if (error.status === 401) return 'Your session has expired. Sign in again to continue.'
    if (error.status >= 500) return 'Something went wrong on our side. Try again in a moment.'
    return error.message
  }
  if (error instanceof TypeError) return 'Network trouble — check your connection and try again.'
  return 'Something went wrong. Try again.'
}
