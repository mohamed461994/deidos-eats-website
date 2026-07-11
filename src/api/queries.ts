import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'

import { useAuth } from '@/auth/context'

import { isApiError } from './errors'
import { api } from './index'
import type { Branch, Order, Restaurant, RestaurantList } from './types'

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

/** Every restaurant on the marketplace — the discovery feed. */
export function useRestaurants(): UseQueryResult<RestaurantList> {
  return useQuery({
    queryKey: queryKeys.restaurants,
    queryFn: () => api.listRestaurants(),
    staleTime: 5 * 60_000,
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
    staleTime: 5 * 60_000,
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
    staleTime: 5 * 60_000,
  })
}

export function useBranch(branchId: string | null) {
  return useQuery({
    queryKey: queryKeys.branch(branchId ?? 'none'),
    queryFn: () => api.getBranch(branchId!),
    enabled: branchId !== null,
    staleTime: 60_000,
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
    })),
  })
}

export function useMenu(branchId: string | null) {
  return useQuery({
    queryKey: queryKeys.menu(branchId ?? 'none'),
    queryFn: () => api.getBranchMenu(branchId!),
    enabled: branchId !== null,
    staleTime: 60_000,
  })
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
