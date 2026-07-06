/**
 * The single API surface consumed by the app. Mode is decided once at startup:
 * `mock` (default) → in-browser mock with the same shapes and error codes;
 * `live` → the real Deidos Eats API.
 */
import { isMock } from '@/config'

import * as live from './live'
import * as mock from './mock/api'

export const api = {
  listRestaurants: isMock ? mock.listRestaurants : live.listRestaurants,
  getBranch: isMock ? mock.getBranch : live.getBranch,
  getBranchMenu: isMock ? mock.getBranchMenu : live.getBranchMenu,
  validateCart: isMock ? mock.validateCart : live.validateCart,
  checkout: isMock ? mock.checkout : live.checkout,
  listMyOrders: isMock ? mock.listMyOrders : live.listMyOrders,
  getMyOrder: isMock ? mock.getMyOrder : live.getMyOrder,
  cancelMyOrder: isMock ? mock.cancelMyOrder : live.cancelMyOrder,
  getMe: isMock ? mock.getMe : live.getMe,
  updateMe: isMock ? mock.updateMe : live.updateMe,
  listMyAddresses: isMock ? mock.listMyAddresses : live.listMyAddresses,
  createMyAddress: isMock ? mock.createMyAddress : live.createMyAddress,
  deleteMyAddress: isMock ? mock.deleteMyAddress : live.deleteMyAddress,
}

export { ApiError, errorMessage, isApiError } from './errors'
