import type {
  AdminBanner,
  AdminBannerCreate,
  AdminBannerList,
  AdminBannerUpdate,
  AdminBranchList,
  AdminBranch,
  AdminBranchCreate,
  AdminBranchUpdate,
  AdminRestaurant,
  AdminRestaurantCreate,
  AdminRestaurantList,
  AdminRestaurantUpdate,
  ImageUploadRequest,
  ImageUploadResponse,
  MenuCatalogItem,
  MenuCatalogPage,
  MenuItemUpdate,
  OvenFeature,
  OvenFeatureCreate,
  OvenFeatureList,
  OvenFeatureUpdate,
  SiteContentEntry,
  SiteContentKey,
  SiteContentList,
  SiteContentUpdate,
  StaffBranchMembershipList,
} from './types'
import { apiRequest } from './http'

function pageParams(cursor?: string, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams({ limit: '100' })
  if (cursor) params.set('cursor', cursor)
  Object.entries(extra).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  return params.toString()
}

function editOptions<T>(body: T, updatedAt?: string) {
  return {
    method: 'PATCH' as const,
    body,
    ...(updatedAt ? { headers: { 'If-Match': updatedAt } } : {}),
  }
}

export async function listMyStaffBranches(): Promise<StaffBranchMembershipList> {
  return apiRequest('/me/branches')
}

export async function listAdminBranches(cursor?: string): Promise<AdminBranchList> {
  return apiRequest(`/admin/branches?${pageParams(cursor)}`)
}

export async function listAdminRestaurants(cursor?: string): Promise<AdminRestaurantList> {
  return apiRequest(`/admin/restaurants?${pageParams(cursor)}`)
}

export async function getStaffBranchMenuCatalog(
  branchId: string,
  cursor?: string,
): Promise<MenuCatalogPage> {
  return apiRequest(`/staff/branches/${encodeURIComponent(branchId)}/menu?${pageParams(cursor)}`)
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

export async function listAdminBanners(cursor?: string): Promise<AdminBannerList> {
  return apiRequest(`/admin/banners?${pageParams(cursor)}`)
}

export async function createAdminBanner(input: AdminBannerCreate): Promise<AdminBanner> {
  return apiRequest('/admin/banners', { method: 'POST', body: input })
}

export async function updateAdminBanner(
  bannerId: string,
  input: AdminBannerUpdate,
  updatedAt?: string,
): Promise<AdminBanner> {
  return apiRequest(`/admin/banners/${encodeURIComponent(bannerId)}`, editOptions(input, updatedAt))
}

export async function deleteAdminBanner(bannerId: string): Promise<void> {
  await apiRequest(`/admin/banners/${encodeURIComponent(bannerId)}`, { method: 'DELETE' })
}

export async function requestAdminBannerImage(
  input: ImageUploadRequest,
): Promise<ImageUploadResponse> {
  return apiRequest('/admin/banners/images', { method: 'POST', body: input })
}

export async function listAdminOvenFeatures(cursor?: string, branchId?: string): Promise<OvenFeatureList> {
  return apiRequest(`/admin/oven-features?${pageParams(cursor, { branchId })}`)
}

export async function createAdminOvenFeature(input: OvenFeatureCreate): Promise<OvenFeature> {
  return apiRequest('/admin/oven-features', { method: 'POST', body: input })
}

export async function updateAdminOvenFeature(
  featureId: string,
  input: OvenFeatureUpdate,
  updatedAt?: string,
): Promise<OvenFeature> {
  return apiRequest(`/admin/oven-features/${encodeURIComponent(featureId)}`, editOptions(input, updatedAt))
}

export async function deleteAdminOvenFeature(featureId: string): Promise<void> {
  await apiRequest(`/admin/oven-features/${encodeURIComponent(featureId)}`, { method: 'DELETE' })
}

export async function listAdminContent(): Promise<SiteContentList> {
  return apiRequest('/admin/content')
}

export async function setAdminContent(
  key: SiteContentKey,
  input: SiteContentUpdate,
  updatedAt?: string,
): Promise<SiteContentEntry> {
  return apiRequest(`/admin/content/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: input,
    ...(updatedAt ? { headers: { 'If-Match': updatedAt } } : {}),
  })
}

export async function createAdminRestaurant(
  input: AdminRestaurantCreate,
): Promise<AdminRestaurant> {
  return apiRequest('/admin/restaurants', { method: 'POST', body: input })
}

export async function updateAdminRestaurant(
  restaurantId: string,
  input: AdminRestaurantUpdate,
  updatedAt?: string,
): Promise<AdminRestaurant> {
  return apiRequest(
    `/admin/restaurants/${encodeURIComponent(restaurantId)}`,
    editOptions(input, updatedAt),
  )
}

export async function requestAdminRestaurantImage(
  restaurantId: string,
  input: ImageUploadRequest,
): Promise<ImageUploadResponse> {
  return apiRequest(`/admin/restaurants/${encodeURIComponent(restaurantId)}/images`, {
    method: 'POST',
    body: input,
  })
}

export async function createAdminBranch(input: AdminBranchCreate): Promise<AdminBranch> {
  return apiRequest('/admin/branches', { method: 'POST', body: input })
}

export async function updateAdminBranch(
  branchId: string,
  input: AdminBranchUpdate,
  updatedAt?: string,
): Promise<AdminBranch> {
  return apiRequest(`/admin/branches/${encodeURIComponent(branchId)}`, editOptions(input, updatedAt))
}

export async function requestAdminBranchImage(
  branchId: string,
  input: ImageUploadRequest,
): Promise<ImageUploadResponse> {
  return apiRequest(`/admin/branches/${encodeURIComponent(branchId)}/images`, {
    method: 'POST',
    body: input,
  })
}

export async function uploadAdminImage(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!response.ok) throw new Error('The image upload did not complete. Try again.')
}
