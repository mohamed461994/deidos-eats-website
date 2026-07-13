export const DEFAULT_STAFF_SIGN_IN_PATH = '/access/hall-47'

const RESERVED_ROUTE_ROOTS = [
  '/admin',
  '/signin',
  '/signup',
  '/account',
  '/checkout',
  '/orders',
  '/restaurants',
  '/menu',
  '/locations',
  '/r',
]

function overlapsReservedRoute(path: string): boolean {
  return RESERVED_ROUTE_ROOTS.some(
    (root) => path === root || path.startsWith(`${root}/`),
  )
}

/** Validate the public-but-unlinked staff entry without shadowing any buyer route. */
export function normalizeStaffSignInPath(value: unknown): string {
  const configured =
    typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_STAFF_SIGN_IN_PATH
  const path = configured.endsWith('/') ? configured.slice(0, -1) : configured
  if (
    !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path) ||
    overlapsReservedRoute(path)
  ) {
    throw new Error(
      'VITE_STAFF_SIGN_IN_PATH must be a distinct absolute app path with no query/hash and must not overlap buyer or /admin routes.',
    )
  }
  return path
}
