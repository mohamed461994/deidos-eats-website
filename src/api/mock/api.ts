/**
 * MOCK API — mirrors the live endpoints' behavior (repricing, validation,
 * error codes, latency) closely enough that the UI cannot tell the difference.
 * Server rules replicated here: prices come from the menu (client prices are
 * never trusted), VAT is derived from VAT-inclusive prices, delivery fee is
 * the branch's flat base fee, cancellation only while `placed`.
 */
import type {
  Address,
  AddressCreate,
  AdminBanner,
  AdminBannerCreate,
  AdminBannerList,
  AdminBannerUpdate,
  AdminBranch,
  AdminBranchCreate,
  AdminStaffCreate,
  AdminStaffCreateResult,
  AdminStaffList,
  AdminStaffMember,
  AdminStaffMemberUpdate,
  AdminStaffPasswordReset,
  AdminBranchList,
  AdminBranchUpdate,
  AdminRestaurant,
  AdminRestaurantCreate,
  AdminRestaurantList,
  AdminRestaurantUpdate,
  Branch,
  CartValidateRequest,
  CheckoutRequest,
  CheckoutResponse,
  MarketplaceBranch,
  MarketplaceHome,
  MarketplaceItem,
  Menu,
  MenuCatalogItem,
  MenuCatalogPage,
  MenuItem,
  MenuItemUpdate,
  OvenFeature,
  OvenFeatureCreate,
  OvenFeatureList,
  OvenFeatureUpdate,
  Order,
  OrderList,
  PricedCart,
  PricedCartLine,
  Restaurant,
  RestaurantList,
  StaffBranchMembershipList,
  SiteContentEntry,
  SiteContentKey,
  SiteContentList,
  SiteContentUpdate,
  ImageUploadRequest,
  ImageUploadResponse,
  User,
  UserUpdate,
} from '@/api/types'
import { haversineKm } from '@/lib/distance'

import { ApiError } from '../errors'
import {
  bumpMockPromoTokenForTests,
  listMockMenuCatalog,
  resetMockAdminForTests,
  updateMockPromo,
} from './admin'
import {
  createAdminStaffForTests,
  disableAdminStaffMemberForTests,
  enableAdminStaffMemberForTests,
  getAdminStaffMemberForTests,
  listAdminStaffForTests,
  resetAdminStaffForTests,
  resetAdminStaffPasswordForTests,
  updateAdminStaffMemberForTests,
} from './admin-staff'
import {
  createAdminBannerForTests,
  createAdminBranchForTests,
  createAdminOvenFeatureForTests,
  createAdminRestaurantForTests,
  deleteAdminBannerForTests,
  deleteAdminOvenFeatureForTests,
  listAdminBannersForTests,
  listAdminBranchesForTests,
  listAdminContentForTests,
  listAdminOvenFeaturesForTests,
  listAdminRestaurantsForTests,
  requestAdminImageForTests,
  resetMockAdminContentForTests,
  setAdminContentForTests,
  updateAdminBannerForTests,
  updateAdminBranchForTests,
  updateAdminOvenFeatureForTests,
  updateAdminRestaurantForTests,
  uploadAdminImageForTests,
} from './admin-content'
import {
  activePromoFor,
  allRestaurants,
  branches,
  menus,
  mockMarketplace,
  promoFieldsFor,
  publishedRestaurants,
  resetMarketplaceForTests,
  restaurantForBranch,
} from './data'
import { mockStore } from './store'

const LATENCY_MS = 350

function delay(ms = LATENCY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, { code, message })
}

function requireUser(): User {
  const email = mockStore.currentEmail
  if (!email) fail(401, 'unauthorized', 'Sign in to continue.')
  // Creating the record on first authenticated read IS the first-login sync.
  return mockStore.syncUser(email)
}

function findMenuItem(menu: Menu, menuItemId: string): MenuItem | undefined {
  for (const category of menu.categories) {
    const item = category.items.find((i) => i.id === menuItemId)
    if (item) return item
  }
  return undefined
}

/** VAT-inclusive pricing: net = gross / (1 + rate). Grouped by rate like the server. */
function vatBreakdownFor(lines: PricedCartLine[]) {
  const byRate = new Map<number, { gross: number }>()
  for (const line of lines) {
    const entry = byRate.get(line.vatRateBasisPoints) ?? { gross: 0 }
    entry.gross += line.lineTotalCents
    byRate.set(line.vatRateBasisPoints, entry)
  }
  return [...byRate.entries()].map(([rateBasisPoints, { gross }]) => {
    const netCents = Math.round(gross / (1 + rateBasisPoints / 10000))
    return { rateBasisPoints, netCents, vatCents: gross - netCents }
  })
}

function priceCart(branch: Branch, request: CartValidateRequest): PricedCart {
  const menu = menus[branch.id]
  if (!menu) fail(404, 'not_found', 'Branch not found.')
  // One pricing instant per request — the server's half-open promo-window rule.
  const now = Date.now()

  const lines: PricedCartLine[] = request.lines.map((lineInput) => {
    const item = findMenuItem(menu, lineInput.menuItemId)
    if (!item) fail(422, 'items_unavailable', 'An item in your cart is no longer on the menu.')
    if (!item.isAvailable) fail(422, 'items_unavailable', `${item.name} is sold out right now.`)

    const selectedIds = lineInput.selectedModifierOptionIds ?? []
    const modifiers = selectedIds.map((optionId) => {
      const option = (item.modifierGroups ?? [])
        .flatMap((g) => g.options)
        .find((o) => o.id === optionId)
      if (!option || !option.isAvailable)
        fail(422, 'items_unavailable', 'A selected option is unavailable.')
      return {
        modifierOptionId: option.id,
        name: option.name,
        priceDeltaCents: option.priceDeltaCents,
      }
    })

    // Effective online price: the active promo price when one applies, else
    // base — with the base snapshotted on the line so receipts stay truthful.
    const promo = activePromoFor(item.id, now)
    const deltaCents = modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0)
    const baseUnitCents = item.priceCents + deltaCents
    const unitPriceCents = (promo ? promo.promoPriceCents : item.priceCents) + deltaCents
    return {
      menuItemId: item.id,
      name: item.name,
      quantity: lineInput.quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * lineInput.quantity,
      vatRateBasisPoints: item.vatRateBasisPoints,
      ...(promo
        ? {
            originalUnitPriceCents: baseUnitCents,
            discountCents: item.priceCents - promo.promoPriceCents,
            discountSource: 'online_promo' as const,
          }
        : {}),
      ...(modifiers.length > 0 ? { modifiers } : {}),
    }
  })

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0)
  const deliveryFeeCents =
    request.fulfillmentType === 'delivery' ? (branch.fulfillment.deliveryFeeCents ?? 0) : 0

  if (
    request.fulfillmentType === 'delivery' &&
    branch.fulfillment.minOrderCents != null &&
    subtotalCents < branch.fulfillment.minOrderCents
  ) {
    fail(422, 'below_minimum_order', 'Order is below the delivery minimum for this branch.')
  }

  const vatBreakdown = vatBreakdownFor(lines)
  return {
    branchId: branch.id,
    fulfillmentType: request.fulfillmentType,
    currency: 'EUR',
    lines,
    subtotalCents,
    vatBreakdown,
    vatTotalCents: vatBreakdown.reduce((sum, b) => sum + b.vatCents, 0),
    serviceFeeCents: 0,
    deliveryFeeCents,
    totalCents: subtotalCents + deliveryFeeCents,
  }
}

/**
 * TEST-ONLY: one reset for the whole mock API — user-state store AND
 * marketplace fixtures — so a suite can't forget half the seams.
 */
export function resetMockApiForTests() {
  mockStore.resetForTests()
  resetMarketplaceForTests()
  resetMockAdminForTests()
  resetMockAdminContentForTests()
  resetAdminStaffForTests()
}

export { bumpMockPromoTokenForTests }

/* ---- public browse ---------------------------------------------------- */

export async function listRestaurants(): Promise<RestaurantList> {
  await delay()
  return { items: publishedRestaurants(), pageInfo: { nextCursor: null } }
}

export async function getRestaurant(restaurantId: string): Promise<Restaurant> {
  await delay()
  const restaurant = allRestaurants.find((r) => r.id === restaurantId)
  if (!restaurant) fail(404, 'not_found', 'Restaurant not found.')
  return restaurant
}

export async function getRestaurantBySlug(slug: string): Promise<Restaurant> {
  await delay()
  const restaurant = allRestaurants.find((r) => r.slug === slug.toLowerCase())
  if (!restaurant) fail(404, 'not_found', 'Restaurant not found.')
  return restaurant
}

export async function getBranch(branchId: string): Promise<Branch> {
  await delay()
  const branch = branches[branchId]
  if (!branch) fail(404, 'not_found', 'Branch not found.')
  return branch
}

export async function getBranchMenu(branchId: string): Promise<Menu> {
  await delay()
  const menu = menus[branchId]
  if (!menu) fail(404, 'not_found', 'Branch not found.')
  // Project promos the way the server's public menu mapper does: `priceCents`
  // stays the base price everywhere; the promo fields exist only while active.
  const now = Date.now()
  return {
    ...menu,
    categories: menu.categories.map((category) => ({
      ...category,
      items: category.items.map((item) => ({ ...item, ...promoFieldsFor(item.id, now) })),
    })),
  }
}

/* ---- marketplace home --------------------------------------------------- */

const HOME_RADIUS_KM = 15 // mirrors the server's DEFAULT_HOME_RADIUS_KM content default
const MERCH_CAP = 12
const FEED_CAP = 24

function roundKm(km: number): number {
  return Math.round(km * 10) / 10
}

function marketplaceItemFor(
  restaurant: Restaurant,
  branchId: string,
  item: MenuItem,
  nowMs: number,
  coords: { latitude: number; longitude: number } | null,
): MarketplaceItem | null {
  const branch = restaurant.branches.find((b) => b.id === branchId)
  if (!branch) return null
  const distanceKm =
    coords && branch.latitude != null && branch.longitude != null
      ? roundKm(
          haversineKm(coords, { latitude: branch.latitude, longitude: branch.longitude }),
        )
      : null
  // Located callers only see items within the home radius (the server's geo scope).
  if (coords && (distanceKm === null || distanceKm > HOME_RADIUS_KM)) return null
  return {
    itemId: item.id,
    name: item.name,
    imageUrl: item.imageUrl ?? null,
    priceCents: item.priceCents,
    ...promoFieldsFor(item.id, nowMs),
    branchId,
    branchName: branch.name,
    restaurantName: restaurant.name,
    restaurantSlug: restaurant.slug,
    distanceKm,
  }
}

export async function getMarketplaceHome(coords?: {
  lat: number
  lng: number
}): Promise<MarketplaceHome> {
  await delay()
  if (mockMarketplace.failHomeRequests > 0) {
    mockMarketplace.failHomeRequests -= 1
    fail(500, 'internal_error', 'Something went wrong.')
  }
  const now = Date.now()
  const located = coords ? { latitude: coords.lat, longitude: coords.lng } : null
  const source = publishedRestaurants()
  // Merchandising strips only ever sell from restaurants that can take the order.
  const accepting = source.filter((r) => r.marketplaceStatus === 'acceptingOrders')

  const ovenItems = mockMarketplace.ovenPicks
    .flatMap((pick) => {
      const restaurant = accepting.find((r) => r.branches.some((b) => b.id === pick.branchId))
      const menu = menus[pick.branchId]
      const item = menu ? findMenuItem(menu, pick.itemId) : undefined
      if (!restaurant || !item) return []
      const entry = marketplaceItemFor(restaurant, pick.branchId, item, now, located)
      return entry ? [entry] : []
    })
    .slice(0, MERCH_CAP)

  const discountedItems = accepting
    .flatMap((restaurant) =>
      restaurant.branches.flatMap((branch) => {
        const menu = menus[branch.id]
        if (!menu) return []
        return menu.categories.flatMap((category) =>
          category.items.flatMap((item) => {
            if (!activePromoFor(item.id, now)) return []
            const entry = marketplaceItemFor(restaurant, branch.id, item, now, located)
            return entry ? [entry] : []
          }),
        )
      }),
    )
    .slice(0, MERCH_CAP)

  // The branch feed is never radius-filtered: nearest-first when located
  // (unlocatable branches last), open-first + name otherwise — like the server.
  const cards: MarketplaceBranch[] = source.flatMap((restaurant) =>
    restaurant.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      town: branch.town ?? null,
      restaurantSlug: restaurant.slug,
      restaurantName: restaurant.name,
      isOpen:
        restaurant.marketplaceStatus === 'acceptingOrders' &&
        branch.isOpen &&
        (branch.fulfillment.collectionEnabled || branch.fulfillment.deliveryEnabled),
      fulfillment: branch.fulfillment,
      latitude: branch.latitude ?? null,
      longitude: branch.longitude ?? null,
      distanceKm:
        located && branch.latitude != null && branch.longitude != null
          ? roundKm(
              haversineKm(located, { latitude: branch.latitude, longitude: branch.longitude }),
            )
          : null,
    })),
  )
  cards.sort((a, b) => {
    if (located) {
      return (
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.name.localeCompare(b.name)
      )
    }
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return {
    banners: mockMarketplace.banners,
    ovenItems,
    discountedItems,
    branches: { items: cards.slice(0, FEED_CAP), total: cards.length },
    content: { ...mockMarketplace.content },
  }
}

/* ---- cart / checkout --------------------------------------------------- */

export async function validateCart(
  branchId: string,
  request: CartValidateRequest,
): Promise<PricedCart> {
  await delay(500)
  requireUser()
  const branch = branches[branchId]
  if (!branch) fail(404, 'not_found', 'Branch not found.')
  if (request.fulfillmentType === 'delivery' && !request.addressId)
    fail(422, 'validation_failed', 'Delivery orders need a delivery address.')
  return priceCart(branch, request)
}

const usedIdempotencyKeys = new Map<string, CheckoutResponse>()

export async function checkout(
  request: CheckoutRequest,
  idempotencyKey: string,
): Promise<CheckoutResponse> {
  await delay(700)
  const user = requireUser()

  const existing = usedIdempotencyKeys.get(idempotencyKey)
  if (existing) return existing

  const branch = branches[request.branchId]
  if (!branch) fail(404, 'not_found', 'Branch not found.')
  const paymentMethod = request.paymentMethod ?? 'card'
  if (paymentMethod === 'cash' && !branch.payment.cashEnabled)
    fail(422, 'validation_failed', 'This branch does not accept cash orders.')

  let deliveryAddress: Order['deliveryAddress'] = null
  if (request.fulfillmentType === 'delivery') {
    const address = mockStore.getAddresses(user.email).find((a) => a.id === request.addressId)
    if (!address) fail(422, 'validation_failed', 'Delivery orders need a saved delivery address.')
    deliveryAddress = {
      line1: address.line1,
      line2: address.line2,
      town: address.town,
      county: address.county,
      eircode: address.eircode,
    }
  }

  const priced = priceCart(branch, {
    fulfillmentType: request.fulfillmentType,
    addressId: request.addressId,
    lines: request.lines,
  })

  // Snapshot the restaurant onto the order at checkout (renames never rewrite
  // history) — mirrors the API's shared orders mapper.
  const restaurant = restaurantForBranch(branch.id)
  const now = new Date().toISOString()
  const orderId = crypto.randomUUID()
  const order: Order = {
    id: orderId,
    restaurantId: restaurant?.id ?? branch.restaurantId,
    restaurantName: restaurant?.name ?? 'Restaurant',
    restaurantSlug: restaurant?.slug ?? 'restaurant',
    branchId: branch.id,
    branchName: branch.name,
    status: 'placed',
    fulfillmentType: request.fulfillmentType,
    channel: 'online',
    paymentStatus: paymentMethod === 'cash' ? 'paid' : 'requires_payment',
    paymentMethod,
    currency: 'EUR',
    subtotalCents: priced.subtotalCents,
    vatTotalCents: priced.vatTotalCents,
    serviceFeeCents: priced.serviceFeeCents,
    deliveryFeeCents: priced.deliveryFeeCents,
    totalCents: priced.totalCents,
    deliveryAddress,
    note: request.note ?? null,
    lines: priced.lines.map((l) => ({
      name: l.name,
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
      lineTotalCents: l.lineTotalCents,
      vatRateBasisPoints: l.vatRateBasisPoints,
      ...(l.modifiers
        ? { modifiers: l.modifiers.map((m) => ({ name: m.name, priceDeltaCents: m.priceDeltaCents })) }
        : {}),
      allergens: [],
    })),
    statusHistory: [{ status: 'placed', at: now, note: null }],
    placedAt: now,
  }

  mockStore.addOrder(order)

  const response: CheckoutResponse = {
    orderId,
    paymentMethod,
    ...(paymentMethod === 'card'
      ? { paymentIntentClientSecret: `pi_mock_${orderId}_secret_mock` }
      : {}),
    amountCents: priced.totalCents,
    currency: 'EUR',
  }
  usedIdempotencyKeys.set(idempotencyKey, response)
  return response
}

/**
 * MOCK-ONLY: stands in for Stripe's confirmPayment. In live mode the Payment
 * Element confirms against Stripe and the webhook flips paymentStatus to
 * `paid`; here we flip it directly and wake the kitchen.
 */
export async function mockConfirmCardPayment(orderId: string): Promise<void> {
  await delay(900)
  const order = mockStore.getOrder(orderId)
  if (!order) fail(404, 'not_found', 'Order not found.')
  order.paymentStatus = 'paid'
  mockStore.startKitchen(orderId)
}

/** Cash orders skip payment; the kitchen starts as soon as the order lands. */
export function mockStartKitchenForCashOrder(orderId: string): void {
  mockStore.startKitchen(orderId)
}

/* ---- orders ------------------------------------------------------------ */

export async function listMyOrders(cursor?: string): Promise<OrderList> {
  await delay()
  requireUser()
  const PAGE = 10
  const start = cursor ? Number(cursor) : 0
  const slice = mockStore.orders.slice(start, start + PAGE)
  return {
    items: slice.map((o) => ({
      id: o.id,
      restaurantId: o.restaurantId,
      restaurantName: o.restaurantName,
      restaurantSlug: o.restaurantSlug,
      branchId: o.branchId,
      branchName: o.branchName,
      status: o.status,
      fulfillmentType: o.fulfillmentType,
      channel: o.channel,
      paymentMethod: o.paymentMethod,
      totalCents: o.totalCents,
      currency: o.currency,
      placedAt: o.placedAt,
    })),
    pageInfo: {
      nextCursor: start + PAGE < mockStore.orders.length ? String(start + PAGE) : null,
    },
  }
}

export async function getMyOrder(orderId: string): Promise<Order> {
  await delay(250)
  requireUser()
  const order = mockStore.getOrder(orderId)
  if (!order) fail(404, 'not_found', 'Order not found.')
  return { ...order }
}

export async function cancelMyOrder(orderId: string, reason?: string): Promise<Order> {
  await delay(500)
  requireUser()
  const order = mockStore.getOrder(orderId)
  if (!order) fail(404, 'not_found', 'Order not found.')
  if (order.status !== 'placed')
    fail(409, 'order_not_cancellable', 'Order can no longer be cancelled.')
  mockStore.stopKitchen(orderId)
  mockStore.updateOrderStatus(orderId, 'cancelled', reason ?? null)
  return { ...mockStore.getOrder(orderId)! }
}

/* ---- identity ----------------------------------------------------------- */

export async function getMe(): Promise<User> {
  await delay(200)
  // requireUser runs the first-login sync — a fresh account gets an empty record.
  return requireUser()
}

function requirePromoAccess(branchId: string): User {
  const user = requireUser()
  if (user.role === 'admin') return user
  if (
    user.role === 'restaurant_manager' &&
    mockStore.staffBranchIds(user.email).includes(branchId)
  ) {
    return user
  }
  fail(403, 'forbidden', 'You do not have access to this branch.')
}

function requireAdmin(): User {
  const user = requireUser()
  if (user.role !== 'admin') fail(403, 'forbidden', 'Admin access is required.')
  return user
}

export async function listMyStaffBranches(): Promise<StaffBranchMembershipList> {
  await delay()
  const user = requireUser()
  return {
    items: mockStore.staffBranchIds(user.email).flatMap((branchId) => {
      const branch = branches[branchId]
      const restaurant = branch ? restaurantForBranch(branchId) : undefined
      if (!branch || !restaurant) return []
      return [
        {
          branchId,
          branchName: branch.name,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          town: branch.address.town,
          addressLine1: branch.address.line1,
          county: branch.address.county,
          eircode: branch.address.eircode,
          role: 'manager' as const,
        },
      ]
    }),
  }
}

export async function listAdminBranches(cursor?: string, restaurantId?: string): Promise<AdminBranchList> {
  await delay()
  requireAdmin()
  void cursor
  return {
    items: listAdminBranchesForTests(restaurantId),
    pageInfo: { nextCursor: null },
  }
}

export async function listAdminRestaurants(cursor?: string): Promise<AdminRestaurantList> {
  await delay()
  requireAdmin()
  void cursor
  return {
    items: listAdminRestaurantsForTests(),
    pageInfo: { nextCursor: null },
  }
}

export async function listAdminStaff(cursor?: string): Promise<AdminStaffList> {
  await delay()
  requireAdmin()
  void cursor
  return { items: listAdminStaffForTests(), pageInfo: { nextCursor: null } }
}

export async function createAdminStaff(input: AdminStaffCreate): Promise<AdminStaffCreateResult> {
  await delay()
  requireAdmin()
  return createAdminStaffForTests(input)
}

export async function getAdminStaffMember(userId: string): Promise<AdminStaffMember> {
  await delay()
  requireAdmin()
  return getAdminStaffMemberForTests(userId)
}

export async function updateAdminStaffMember(
  userId: string,
  input: AdminStaffMemberUpdate,
): Promise<AdminStaffMember> {
  await delay()
  requireAdmin()
  return updateAdminStaffMemberForTests(userId, input)
}

export async function resetAdminStaffPassword(userId: string): Promise<AdminStaffPasswordReset> {
  await delay()
  requireAdmin()
  return resetAdminStaffPasswordForTests(userId)
}

export async function disableAdminStaffMember(userId: string): Promise<AdminStaffMember> {
  await delay()
  requireAdmin()
  return disableAdminStaffMemberForTests(userId)
}

export async function enableAdminStaffMember(userId: string): Promise<AdminStaffMember> {
  await delay()
  requireAdmin()
  return enableAdminStaffMemberForTests(userId)
}

export async function listAdminBanners(cursor?: string): Promise<AdminBannerList> {
  await delay()
  requireAdmin()
  void cursor
  return { items: listAdminBannersForTests(), pageInfo: { nextCursor: null } }
}

export async function createAdminBanner(input: AdminBannerCreate): Promise<AdminBanner> {
  await delay()
  requireAdmin()
  return createAdminBannerForTests(input)
}

export async function updateAdminBanner(
  bannerId: string,
  input: AdminBannerUpdate,
  expectedUpdatedAt?: string,
): Promise<AdminBanner> {
  await delay()
  requireAdmin()
  return updateAdminBannerForTests(bannerId, input, expectedUpdatedAt)
}

export async function deleteAdminBanner(bannerId: string): Promise<void> {
  await delay()
  requireAdmin()
  deleteAdminBannerForTests(bannerId)
}

export async function requestAdminBannerImage(input: ImageUploadRequest): Promise<ImageUploadResponse> {
  await delay()
  requireAdmin()
  return requestAdminImageForTests('banners', input)
}

export async function listAdminOvenFeatures(
  cursor?: string,
  branchId?: string,
): Promise<OvenFeatureList> {
  await delay()
  requireAdmin()
  void cursor
  return { items: listAdminOvenFeaturesForTests(branchId), pageInfo: { nextCursor: null } }
}

export async function createAdminOvenFeature(input: OvenFeatureCreate): Promise<OvenFeature> {
  await delay()
  requireAdmin()
  return createAdminOvenFeatureForTests(input)
}

export async function updateAdminOvenFeature(
  featureId: string,
  input: OvenFeatureUpdate,
  expectedUpdatedAt?: string,
): Promise<OvenFeature> {
  await delay()
  requireAdmin()
  return updateAdminOvenFeatureForTests(featureId, input, expectedUpdatedAt)
}

export async function deleteAdminOvenFeature(featureId: string): Promise<void> {
  await delay()
  requireAdmin()
  deleteAdminOvenFeatureForTests(featureId)
}

export async function listAdminContent(): Promise<SiteContentList> {
  await delay()
  requireAdmin()
  return { items: listAdminContentForTests() }
}

export async function setAdminContent(
  key: SiteContentKey,
  input: SiteContentUpdate,
  expectedUpdatedAt?: string,
): Promise<SiteContentEntry> {
  await delay()
  requireAdmin()
  return setAdminContentForTests(key, input, expectedUpdatedAt)
}

export async function createAdminRestaurant(
  input: AdminRestaurantCreate,
): Promise<AdminRestaurant> {
  await delay()
  requireAdmin()
  return createAdminRestaurantForTests(input)
}

export async function updateAdminRestaurant(
  restaurantId: string,
  input: AdminRestaurantUpdate,
  expectedUpdatedAt?: string,
): Promise<AdminRestaurant> {
  await delay()
  requireAdmin()
  return updateAdminRestaurantForTests(restaurantId, input, expectedUpdatedAt)
}

export async function requestAdminRestaurantImage(
  restaurantId: string,
  input: ImageUploadRequest,
): Promise<ImageUploadResponse> {
  await delay()
  requireAdmin()
  return requestAdminImageForTests(`restaurants/${restaurantId}`, input)
}

export async function createAdminBranch(input: AdminBranchCreate): Promise<AdminBranch> {
  await delay()
  requireAdmin()
  return createAdminBranchForTests(input)
}

export async function updateAdminBranch(
  branchId: string,
  input: AdminBranchUpdate,
  expectedUpdatedAt?: string,
): Promise<AdminBranch> {
  await delay()
  requireAdmin()
  return updateAdminBranchForTests(branchId, input, expectedUpdatedAt)
}

export async function requestAdminBranchImage(
  branchId: string,
  input: ImageUploadRequest,
): Promise<ImageUploadResponse> {
  await delay()
  requireAdmin()
  return requestAdminImageForTests(`branches/${branchId}`, input)
}

export async function uploadAdminImage(): Promise<void> {
  await uploadAdminImageForTests()
}

export async function getStaffBranchMenuCatalog(
  branchId: string,
): Promise<MenuCatalogPage> {
  await delay()
  requirePromoAccess(branchId)
  return listMockMenuCatalog(branchId)
}

export async function updateStaffItemPromo(
  itemId: string,
  update: MenuItemUpdate,
): Promise<MenuCatalogItem> {
  await delay()
  const branchId = Object.keys(menus).find((candidate) =>
    menus[candidate].categories.some((category) =>
      category.items.some((item) => item.id === itemId),
    ),
  )
  if (!branchId) fail(404, 'not_found', 'Item not found.')
  requirePromoAccess(branchId)
  return updateMockPromo(itemId, update)
}

export async function updateMe(update: UserUpdate): Promise<User> {
  await delay()
  const user = requireUser()
  return mockStore.updateUser(user.email, {
    ...(update.fullName !== undefined ? { fullName: update.fullName } : {}),
    ...(update.phone !== undefined ? { phone: update.phone } : {}),
  })
}

export async function listMyAddresses(): Promise<Address[]> {
  await delay()
  const user = requireUser()
  return [...mockStore.getAddresses(user.email)]
}

export async function createMyAddress(input: AddressCreate): Promise<Address> {
  await delay()
  const user = requireUser()
  const address: Address = {
    id: crypto.randomUUID(),
    label: input.label ?? null,
    line1: input.line1,
    line2: input.line2 ?? null,
    town: input.town,
    county: input.county,
    eircode: input.eircode,
    isDefault: input.isDefault ?? false,
  }
  mockStore.addAddress(user.email, address)
  return address
}

export async function deleteMyAddress(addressId: string): Promise<void> {
  await delay()
  const user = requireUser()
  if (!mockStore.removeAddress(user.email, addressId))
    fail(404, 'not_found', 'Address not found.')
}

export async function registerDevice(): Promise<void> {
  // Web push registration is contract-supported (platform: 'web') but the
  // website doesn't request notification permission yet — see implementation.md.
  await delay(100)
}
