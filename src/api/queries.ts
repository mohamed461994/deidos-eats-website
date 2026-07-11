import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'

import { useAuth } from '@/auth/context'
import { config } from '@/config'

import { api } from './index'
import type { Branch, Order, Restaurant } from './types'

export const queryKeys = {
  restaurant: ['restaurant'] as const,
  branch: (id: string) => ['branch', id] as const,
  menu: (id: string) => ['menu', id] as const,
  orders: ['orders'] as const,
  order: (id: string) => ['order', id] as const,
  me: ['me'] as const,
  addresses: ['addresses'] as const,
}

/** The single chain this site belongs to (first restaurant, or the pinned id). */
export function useRestaurant(): UseQueryResult<Restaurant> {
  return useQuery({
    queryKey: queryKeys.restaurant,
    queryFn: async () => {
      const list = await api.listRestaurants()
      const pinned = config.restaurantId
        ? list.items.find((r) => r.id === config.restaurantId)
        : undefined
      const restaurant = pinned ?? list.items[0]
      if (!restaurant) throw new Error('No restaurant configured')
      return restaurant
    },
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
