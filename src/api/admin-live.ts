import type {
  AdminBranchList,
  AdminRestaurantList,
  MenuCatalogItem,
  MenuCatalogPage,
  MenuItemUpdate,
  StaffBranchMembershipList,
} from './types'
import { apiRequest } from './http'

export async function listMyStaffBranches(): Promise<StaffBranchMembershipList> {
  return apiRequest('/me/branches')
}

export async function listAdminBranches(cursor?: string): Promise<AdminBranchList> {
  const params = new URLSearchParams({ limit: '100' })
  if (cursor) params.set('cursor', cursor)
  return apiRequest(`/admin/branches?${params.toString()}`)
}

export async function listAdminRestaurants(cursor?: string): Promise<AdminRestaurantList> {
  const params = new URLSearchParams({ limit: '100' })
  if (cursor) params.set('cursor', cursor)
  return apiRequest(`/admin/restaurants?${params.toString()}`)
}

export async function getStaffBranchMenuCatalog(
  branchId: string,
  cursor?: string,
): Promise<MenuCatalogPage> {
  const params = new URLSearchParams({ limit: '100' })
  if (cursor) params.set('cursor', cursor)
  return apiRequest(`/staff/branches/${encodeURIComponent(branchId)}/menu?${params.toString()}`)
}

export async function updateStaffItemPromo(
  itemId: string,
  update: MenuItemUpdate,
): Promise<MenuCatalogItem> {
  return apiRequest(`/staff/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: update,
  })
}
