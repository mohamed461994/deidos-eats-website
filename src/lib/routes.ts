/**
 * Central URL builders for the marketplace routes. One place so a slug/branch
 * path shape never drifts between the router, links, redirects, and tests.
 * Branch lives IN the menu URL so refresh / share / history / "order again" can
 * never show a different branch's menu than the one the user saw (plan §6.2.1).
 */
export const paths = {
  /** The marketplace front door — the branch-first home page. */
  discovery: () => '/',
  restaurant: (slug: string) => `/r/${slug}`,
  restaurantMenu: (slug: string, branchId: string) => `/r/${slug}/b/${branchId}/menu`,
  restaurantLocations: (slug: string) => `/r/${slug}/locations`,
  checkout: () => '/checkout',
  orders: () => '/orders',
  order: (orderId: string) => `/orders/${orderId}`,
  account: () => '/account',
  signIn: (next?: string) => (next ? `/signin?next=${encodeURIComponent(next)}` : '/signin'),
  signUp: (next?: string) => (next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'),
  admin: () => '/admin',
  adminDiscounts: () => '/admin/discounts',
} as const
