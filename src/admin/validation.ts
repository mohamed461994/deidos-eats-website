import { isApiError } from '@/api'

/**
 * The API returns Zod's nested validation tree in `details.issues`. Keep the
 * parsing here so admin forms can attach a useful message to the field that
 * failed instead of replacing it with a generic form-level warning.
 */
export function hasApiValidationIssue(error: unknown, path: readonly string[]): boolean {
  if (!isApiError(error, 'validation_failed')) return false

  let issue: unknown = error.details?.issues
  for (const segment of path) {
    if (!issue || typeof issue !== 'object' || !('properties' in issue)) return false
    const properties = issue.properties
    if (!properties || typeof properties !== 'object') return false
    issue = (properties as Record<string, unknown>)[segment]
  }

  return Boolean(
    issue &&
      typeof issue === 'object' &&
      'errors' in issue &&
      Array.isArray(issue.errors) &&
      issue.errors.length > 0,
  )
}
