import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useMemo } from 'react'

import { useAuth } from '@/auth/context'

import type { HomeLocation } from '@/lib/location'
import { usePromoBoundaryRefresh } from '@/lib/use-promo-refresh'

import { isApiError } from './errors'
import { api } from './index'
import type { Branch, MarketplaceHome, Order, Restaurant, RestaurantList } from './types'

/**
 * A 404 for a slug/id is definitive (unknown or non-published restaurant) — never
 * retry it, so the soft-404 UI shows immediately instead of hanging on a skeleton
 * through the retry backoff. Transient errors still get one retry.
 */
function retryExceptNotFound(failureCount: number, error: Error): boolean {
  if (isApiError(error) && error.status === 404) return false
  return failureCount < 1
}

export const queryKeys = {
  restaurants: ['restaurants'] as const,
  /** Prefix for every home aggregate — invalidate this to refresh all locations. */
  marketplaceHomeAll: ['marketplace-home'] as const,
  marketplaceHome: (location: HomeLocation | null) =>
    ['marketplace-home', location?.latitude ?? null, location?.longitude ?? null] as const,
  /** The id-keyed source of truth for a single restaurant (plan §6.2.1). */
  restaurant: (id: string) => ['restaurant', id] as const,
  /** Slug → restaurant resolution for `/r/:slug`; seeds `['restaurant', id]`. */
  restaurantBySlug: (slug: string) => ['restaurant-by-slug', slug] as const,
  branch: (id: string) => ['branch', id] as const,
  menu: (id: string) => ['menu', id] as const,
  orders: ['orders'] as const,
  order: (id: string) => ['order', id] as const,
  me: ['me'] as const,
  addresses: ['addresses'] as const,
}

/**
 * How long public browse data may live — used as BOTH the in-memory `gcTime` of
 * the persisted queries below AND the on-disk max age in query-persistence.ts,
 * so the two agree. They must match: the persistence writer snapshots the LIVE
 * cache, so a query evicted from memory before this window is up would be
 * dropped from the next snapshot and the on-disk copy would be lost early. "Not
 * changing daily" (the caching goal) makes a day the natural window.
 */
export const PUBLIC_QUERY_CACHE_MS = 24 * 60 * 60 * 1000

/**
 * How long a menu/restaurant read is treated as fresh before a background
 * revalidation. Within it, reloads and revisits skip the network entirely;
 * past it, the cached data still paints instantly and refetches in the
 * background. This is the freshness↔request-volume dial — raising it cuts
 * requests but lengthens how long a just-started promo or price change stays
 * invisible on the buyer menu (never a mischarge: checkout reprices from the
 * DB). 5 min matches the existing restaurant reads.
 */
export const BROWSE_STALE_MS = 5 * 60 * 1000

/**
 * Query-key prefixes whose payloads are PUBLIC browse data — no auth, no
 * user-specific content — and so may be persisted to localStorage (consumed by
 * query-persistence.ts). Declared here, next to `queryKeys`, so a new query's
 * public/private status is decided where the key is defined. Derived from the
 * builders (not free string literals) so a prefix rename can't silently
 * de-sync the whitelist. Deliberately EXCLUDES `marketplaceHome`: its key
 * embeds the buyer's coordinates, which must not be written to disk.
 */
export const PUBLIC_QUERY_PREFIXES: ReadonlySet<string> = new Set([
  queryKeys.restaurants[0],
  queryKeys.restaurant('')[0],
  queryKeys.restaurantBySlug('')[0],
  queryKeys.branch('')[0],
  queryKeys.menu('')[0],
])

/**
 * Promo-bearing queries own their own freshness: the moment the earliest
 * visible `promoEndsAt` passes (or a slept tab wakes past it), the query is
 * invalidated so a "was/now" price never outlives its promo. Wired here in
 * the data layer — every consumer of the query gets it for free.
 */
function usePromoBoundaryInvalidation(
  promoEndsAts: Array<string | null | undefined>,
  queryKey: QueryKey,
) {
  const queryClient = useQueryClient()
  usePromoBoundaryRefresh(promoEndsAts, () => {
    void queryClient.invalidateQueries({ queryKey })
  })
}

/**
 * The `/` aggregate: banners, merchandising strips, the server-sorted branch
 * feed, and admin content. Keyed by the (already ~3-decimal-rounded) location
 * so switching town/geolocation refetches, and clearing it falls back to the
 * open-first, location-agnostic payload. `keepPreviousData` keeps the loaded
 * page mounted while a location change refetches (re-sort in place, no
 * skeleton flash); short staleTime because promo prices live here.
 */
export function useMarketplaceHome(location: HomeLocation | null): UseQueryResult<MarketplaceHome> {
  const query = useQuery({
    queryKey: queryKeys.marketplaceHome(location),
    queryFn: () =>
      api.getMarketplaceHome(
        location ? { lat: location.latitude, lng: location.longitude } : undefined,
      ),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  const promoBoundaries = useMemo(
    () =>
      query.data
        ? [...query.data.ovenItems, ...query.data.discountedItems].map((item) => item.promoEndsAt)
        : [],
    [query.data],
  )
  usePromoBoundaryInvalidation(promoBoundaries, queryKeys.marketplaceHomeAll)
  return query
}

/** Every restaurant on the marketplace — the discovery feed. */
export function useRestaurants(): UseQueryResult<RestaurantList> {
  return useQuery({
    queryKey: queryKeys.restaurants,
    queryFn: () => api.listRestaurants(),
    staleTime: BROWSE_STALE_MS,
    gcTime: PUBLIC_QUERY_CACHE_MS,
  })
}

/**
 * Resolve a restaurant from the slug in the URL (`/r/:slug`). On success it also
 * seeds the id-keyed cache (`['restaurant', id]`) so id-based consumers — the
 * cart's restaurant at checkout, "order again" — hit cache instead of refetching.
 * A 404 (unknown or non-published slug) surfaces as the query error → soft-404 UI.
 */
export function useRestaurantBySlug(slug: string | undefined): UseQueryResult<Restaurant> {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: queryKeys.restaurantBySlug(slug ?? 'none'),
    queryFn: async () => {
      const restaurant = await api.getRestaurantBySlug(slug!)
      queryClient.setQueryData(queryKeys.restaurant(restaurant.id), restaurant)
      return restaurant
    },
    enabled: !!slug,
    retry: retryExceptNotFound,
    staleTime: BROWSE_STALE_MS,
    gcTime: PUBLIC_QUERY_CACHE_MS,
  })
}

/**
 * A restaurant by its stable id (`['restaurant', id]`). Used on global routes
 * that must derive identity from the cart/order, never "the last restaurant
 * browsed" (plan §6.2.8) — e.g. checkout resolving `cart.restaurantId`.
 */
export function useRestaurant(restaurantId: string | null | undefined): UseQueryResult<Restaurant> {
  return useQuery({
    queryKey: queryKeys.restaurant(restaurantId ?? 'none'),
    queryFn: () => api.getRestaurant(restaurantId!),
    enabled: !!restaurantId,
    retry: retryExceptNotFound,
    staleTime: BROWSE_STALE_MS,
    gcTime: PUBLIC_QUERY_CACHE_MS,
  })
}

export function useBranch(branchId: string | null) {
  return useQuery({
    queryKey: queryKeys.branch(branchId ?? 'none'),
    queryFn: () => api.getBranch(branchId!),
    enabled: branchId !== null,
    staleTime: 60_000,
    gcTime: PUBLIC_QUERY_CACHE_MS,
  })
}

/**
 * Fetch several branches' full details at once (name, address, hours, coords).
 * Shares the exact per-branch cache key with `useBranch`, so a branch already
 * loaded elsewhere is served from cache. Pass `[]` to fetch nothing — used by
 * the branch picker (distance sort) and checkout (county-match suggestion).
 */
export function useBranchesDetails(branchIds: string[]): UseQueryResult<Branch>[] {
  return useQueries({
    queries: branchIds.map((id) => ({
      queryKey: queryKeys.branch(id),
      queryFn: () => api.getBranch(id),
      staleTime: 60_000,
      gcTime: PUBLIC_QUERY_CACHE_MS,
    })),
  })
}

export function useMenu(branchId: string | null) {
  const query = useQuery({
    queryKey: queryKeys.menu(branchId ?? 'none'),
    queryFn: () => api.getBranchMenu(branchId!),
    enabled: branchId !== null,
    // Fresh for BROWSE_STALE_MS, then stale-while-revalidate; retained in memory
    // (and the persistence snapshot) for PUBLIC_QUERY_CACHE_MS so reloads and
    // revisits skip the network. Safe: promo endings still invalidate at their
    // exact instant (below), availability is re-checked at cart validate/
    // checkout, and the server reprices every order from the DB — a cached price
    // is display-only and can never change what a buyer is charged.
    staleTime: BROWSE_STALE_MS,
    gcTime: PUBLIC_QUERY_CACHE_MS,
  })
  const promoBoundaries = useMemo(
    () => (query.data?.categories ?? []).flatMap((c) => c.items.map((i) => i.promoEndsAt)),
    [query.data],
  )
  usePromoBoundaryInvalidation(promoBoundaries, queryKeys.menu(branchId ?? 'none'))
  return query
}

export function useMyOrders() {
  const { status } = useAuth()
  return useQuery({
    queryKey: queryKeys.orders,
    queryFn: () => api.listMyOrders(),
    enabled: status === 'signedIn',
  })
}

export function useOrder(orderId: string | undefined) {
  const { status } = useAuth()
  return useQuery({
    queryKey: queryKeys.order(orderId ?? 'none'),
    queryFn: () => api.getMyOrder(orderId!),
    enabled: status === 'signedIn' && !!orderId,
  })
}

export function useMe() {
  const { status } = useAuth()
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.getMe(),
    enabled: status === 'signedIn',
  })
}

export function useAddresses() {
  const { status } = useAuth()
  return useQuery({
    queryKey: queryKeys.addresses,
    queryFn: () => api.listMyAddresses(),
    enabled: status === 'signedIn',
  })
}

export function useCancelOrder(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reason?: string) => api.cancelMyOrder(orderId, reason),
    onSuccess: (order: Order) => {
      queryClient.setQueryData(queryKeys.order(orderId), order)
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders })
    },
  })
}
