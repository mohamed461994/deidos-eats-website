/** Staff-only API surface. Imported exclusively from lazy admin chunks. */
import { isMock } from '@/config'

import * as live from './admin-live'
import * as mock from './mock/api'

export const adminApi = {
  listMyStaffBranches: isMock ? mock.listMyStaffBranches : live.listMyStaffBranches,
  listAdminBranches: isMock ? mock.listAdminBranches : live.listAdminBranches,
  listAdminRestaurants: isMock ? mock.listAdminRestaurants : live.listAdminRestaurants,
  getStaffBranchMenuCatalog: isMock
    ? mock.getStaffBranchMenuCatalog
    : live.getStaffBranchMenuCatalog,
  updateStaffItemPromo: isMock ? mock.updateStaffItemPromo : live.updateStaffItemPromo,
  listAdminBanners: isMock ? mock.listAdminBanners : live.listAdminBanners,
  createAdminBanner: isMock ? mock.createAdminBanner : live.createAdminBanner,
  updateAdminBanner: isMock ? mock.updateAdminBanner : live.updateAdminBanner,
  deleteAdminBanner: isMock ? mock.deleteAdminBanner : live.deleteAdminBanner,
  requestAdminBannerImage: isMock ? mock.requestAdminBannerImage : live.requestAdminBannerImage,
  listAdminOvenFeatures: isMock ? mock.listAdminOvenFeatures : live.listAdminOvenFeatures,
  createAdminOvenFeature: isMock ? mock.createAdminOvenFeature : live.createAdminOvenFeature,
  updateAdminOvenFeature: isMock ? mock.updateAdminOvenFeature : live.updateAdminOvenFeature,
  deleteAdminOvenFeature: isMock ? mock.deleteAdminOvenFeature : live.deleteAdminOvenFeature,
  listAdminContent: isMock ? mock.listAdminContent : live.listAdminContent,
  setAdminContent: isMock ? mock.setAdminContent : live.setAdminContent,
  createAdminRestaurant: isMock ? mock.createAdminRestaurant : live.createAdminRestaurant,
  updateAdminRestaurant: isMock ? mock.updateAdminRestaurant : live.updateAdminRestaurant,
  requestAdminRestaurantImage: isMock
    ? mock.requestAdminRestaurantImage
    : live.requestAdminRestaurantImage,
  createAdminBranch: isMock ? mock.createAdminBranch : live.createAdminBranch,
  updateAdminBranch: isMock ? mock.updateAdminBranch : live.updateAdminBranch,
  requestAdminBranchImage: isMock ? mock.requestAdminBranchImage : live.requestAdminBranchImage,
  uploadAdminImage: isMock ? mock.uploadAdminImage : live.uploadAdminImage,
}
