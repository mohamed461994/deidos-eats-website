import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/api'
import { adminApi } from '@/api/admin-api'
import type {
  AdminBanner,
  AdminBranch,
  AdminRestaurant,
  MenuCatalogItem,
  MenuItemUpdate,
  OvenFeature,
  SiteContentEntry,
  User,
} from '@/api/types'

export interface AccessibleBranch {
  id: string
  name: string
  restaurantName: string
  town: string | null
  timezone: string
}

export const adminQueryKeys = {
  branches: (role: User['role'] | null) => ['admin', 'branches', role] as const,
  adminBranches: ['admin', 'all-branches'] as const,
  restaurants: ['admin', 'restaurants'] as const,
  banners: ['admin', 'banners'] as const,
  ovenFeatures: ['admin', 'oven-features'] as const,
  content: ['admin', 'content'] as const,
  catalog: (branchId: string) => ['admin', 'promo-catalog', branchId] as const,
}

async function allAdminBranches(): Promise<AccessibleBranch[]> {
  const items: Array<Omit<AccessibleBranch, 'restaurantName'> & { restaurantId: string }> = []
  let cursor: string | undefined
  do {
    const page = await adminApi.listAdminBranches(cursor)
    items.push(
      ...page.items.map((branch) => ({
        id: branch.id,
        name: branch.name,
        restaurantId: branch.restaurantId,
        town: branch.address.town ?? null,
        timezone: branch.timezone,
      })),
    )
    cursor = page.pageInfo.nextCursor ?? undefined
  } while (cursor)

  const restaurantNames = new Map<string, string>()
  cursor = undefined
  do {
    const page = await adminApi.listAdminRestaurants(cursor)
    page.items.forEach((restaurant) => restaurantNames.set(restaurant.id, restaurant.name))
    cursor = page.pageInfo.nextCursor ?? undefined
  } while (cursor)

  return items.map((branch) => ({
    id: branch.id,
    name: branch.name,
    restaurantName: restaurantNames.get(branch.restaurantId) ?? 'Unknown restaurant',
    town: branch.town,
    timezone: branch.timezone,
  }))
}

async function managerBranches(): Promise<AccessibleBranch[]> {
  const memberships = await adminApi.listMyStaffBranches()
  const managerMemberships = memberships.items.filter((membership) => membership.role === 'manager')
  const details = await Promise.all(
    managerMemberships.map((membership) => api.getBranch(membership.branchId)),
  )
  return managerMemberships.map((membership, index) => ({
    id: membership.branchId,
    name: membership.branchName,
    restaurantName: membership.restaurantName,
    town: membership.town ?? null,
    timezone: details[index].timezone,
  }))
}

export function useAccessibleBranches(role: User['role'] | null) {
  return useQuery({
    queryKey: adminQueryKeys.branches(role),
    queryFn: () => (role === 'admin' ? allAdminBranches() : managerBranches()),
    enabled: role === 'admin' || role === 'restaurant_manager',
    staleTime: 60_000,
  })
}

async function allCatalogItems(branchId: string): Promise<MenuCatalogItem[]> {
  const items: MenuCatalogItem[] = []
  let cursor: string | undefined
  do {
    const page = await adminApi.getStaffBranchMenuCatalog(branchId, cursor)
    items.push(...page.items)
    cursor = page.pageInfo.nextCursor ?? undefined
  } while (cursor)
  return items
}

export function usePromoCatalog(branchId: string | null) {
  return useQuery({
    queryKey: adminQueryKeys.catalog(branchId ?? 'none'),
    queryFn: () => allCatalogItems(branchId!),
    enabled: branchId !== null,
    staleTime: 0,
  })
}

export function useUpdatePromo(branchId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, update }: { itemId: string; update: MenuItemUpdate }) =>
      adminApi.updateStaffItemPromo(itemId, update),
    onSuccess: async () => {
      if (!branchId) return
      // The PATCH response is useful but never treated as the catalog source of truth.
      // Refetch the full raw catalog after every mutation so reload and pagination agree.
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.catalog(branchId),
        exact: true,
        refetchType: 'active',
      })
    },
  })
}

async function allAdminRestaurants(): Promise<AdminRestaurant[]> {
  const items: AdminRestaurant[] = []
  let cursor: string | undefined
  do {
    const page = await adminApi.listAdminRestaurants(cursor)
    items.push(...page.items)
    cursor = page.pageInfo.nextCursor ?? undefined
  } while (cursor)
  return items
}

async function allAdminBranchesForPanel(): Promise<AdminBranch[]> {
  const items: AdminBranch[] = []
  let cursor: string | undefined
  do {
    const page = await adminApi.listAdminBranches(cursor)
    items.push(...page.items)
    cursor = page.pageInfo.nextCursor ?? undefined
  } while (cursor)
  return items
}

async function allAdminBanners(): Promise<AdminBanner[]> {
  const items: AdminBanner[] = []
  let cursor: string | undefined
  do {
    const page = await adminApi.listAdminBanners(cursor)
    items.push(...page.items)
    cursor = page.pageInfo.nextCursor ?? undefined
  } while (cursor)
  return items
}

async function allAdminOvenFeatures(): Promise<OvenFeature[]> {
  const items: OvenFeature[] = []
  let cursor: string | undefined
  do {
    const page = await adminApi.listAdminOvenFeatures(cursor)
    items.push(...page.items)
    cursor = page.pageInfo.nextCursor ?? undefined
  } while (cursor)
  return items
}

export function useAdminRestaurants() {
  return useQuery({ queryKey: adminQueryKeys.restaurants, queryFn: allAdminRestaurants })
}

export function useAdminBranches() {
  return useQuery({ queryKey: adminQueryKeys.adminBranches, queryFn: allAdminBranchesForPanel })
}

export function useAdminBanners() {
  return useQuery({ queryKey: adminQueryKeys.banners, queryFn: allAdminBanners })
}

export function useAdminOvenFeatures() {
  return useQuery({ queryKey: adminQueryKeys.ovenFeatures, queryFn: allAdminOvenFeatures })
}

export function useAdminContent() {
  return useQuery<SiteContentEntry[]>({
    queryKey: adminQueryKeys.content,
    queryFn: async () => (await adminApi.listAdminContent()).items,
  })
}
