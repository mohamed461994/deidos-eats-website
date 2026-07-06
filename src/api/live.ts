/**
 * LIVE adapters — thin typed wrappers over the real Deidos Eats API.
 * Note: browser calls only work through the Vite /api dev proxy until the API
 * ships CORS headers for the website origin (see implementation.md).
 */
import type {
  Address,
  AddressCreate,
  AddressList,
  Branch,
  CartValidateRequest,
  CheckoutRequest,
  CheckoutResponse,
  DeviceRegistration,
  Menu,
  Order,
  OrderList,
  PricedCart,
  RestaurantList,
  User,
  UserUpdate,
} from './types'
import { apiRequest } from './http'

export async function listRestaurants(): Promise<RestaurantList> {
  return apiRequest('/restaurants?limit=50', { auth: false })
}

export async function getBranch(branchId: string): Promise<Branch> {
  return apiRequest(`/branches/${branchId}`, { auth: false })
}

export async function getBranchMenu(branchId: string): Promise<Menu> {
  return apiRequest(`/branches/${branchId}/menu`, { auth: false })
}

export async function validateCart(
  branchId: string,
  request: CartValidateRequest,
): Promise<PricedCart> {
  return apiRequest(`/branches/${branchId}/cart/validate`, { method: 'POST', body: request })
}

export async function checkout(
  request: CheckoutRequest,
  idempotencyKey: string,
): Promise<CheckoutResponse> {
  return apiRequest('/checkout', {
    method: 'POST',
    body: request,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export async function listMyOrders(cursor?: string): Promise<OrderList> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiRequest(`/orders${query}`)
}

export async function getMyOrder(orderId: string): Promise<Order> {
  return apiRequest(`/orders/${orderId}`)
}

export async function cancelMyOrder(orderId: string, reason?: string): Promise<Order> {
  return apiRequest(`/orders/${orderId}/cancel`, {
    method: 'POST',
    body: reason ? { reason } : {},
  })
}

export async function getMe(): Promise<User> {
  return apiRequest('/me')
}

export async function updateMe(update: UserUpdate): Promise<User> {
  return apiRequest('/me', { method: 'PATCH', body: update })
}

export async function listMyAddresses(): Promise<Address[]> {
  const list = await apiRequest<AddressList>('/me/addresses?limit=50')
  return list.items
}

export async function createMyAddress(input: AddressCreate): Promise<Address> {
  return apiRequest('/me/addresses', { method: 'POST', body: input })
}

export async function deleteMyAddress(addressId: string): Promise<void> {
  return apiRequest(`/me/addresses/${addressId}`, { method: 'DELETE' })
}

export async function registerDevice(registration: DeviceRegistration): Promise<void> {
  await apiRequest('/me/devices', { method: 'POST', body: registration })
}
