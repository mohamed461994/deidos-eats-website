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
}
