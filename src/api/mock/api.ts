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
  Branch,
  CartValidateRequest,
  CheckoutRequest,
  CheckoutResponse,
  Menu,
  MenuItem,
  Order,
  OrderList,
  PricedCart,
  PricedCartLine,
  Restaurant,
  RestaurantList,
  User,
  UserUpdate,
} from '@/api/types'

import { ApiError } from '../errors'
import { allRestaurants, branches, menus, restaurantForBranch, restaurantList } from './data'
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

    const unitPriceCents =
      item.priceCents + modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0)
    return {
      menuItemId: item.id,
      name: item.name,
      quantity: lineInput.quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * lineInput.quantity,
      vatRateBasisPoints: item.vatRateBasisPoints,
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

/* ---- public browse ---------------------------------------------------- */

export async function listRestaurants(): Promise<RestaurantList> {
  await delay()
  return { items: restaurantList, pageInfo: { nextCursor: null } }
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
  return menu
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
