/**
 * MOCK persistent state — orders, addresses, profile — kept in localStorage so
 * refreshes behave like a real account. Also runs the "kitchen": placed orders
 * advance through the real lifecycle on timers, emitting the same
 * OrderChangedMessage shapes the WebSocket pushes in live mode.
 */
import type { Address, Order, OrderChangedMessage, OrderStatus, User } from '@/api/types'

const STORAGE_KEY = 'puca-mock-state-v1'

interface MockState {
  user: User | null
  addresses: Address[]
  orders: Order[]
}

type Listener = (message: OrderChangedMessage) => void

function load(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as MockState
  } catch {
    // corrupted state — start fresh
  }
  return {
    user: null,
    addresses: [
      {
        id: 'addr0000-0000-4000-8000-000000000001',
        label: 'Home',
        line1: '12 Charleston Avenue',
        line2: null,
        town: 'Ranelagh, Dublin 6',
        county: 'Dublin',
        eircode: 'D06 C7W2',
        isDefault: true,
      },
    ],
    orders: [],
  }
}

const state: MockState = load()
const listeners = new Set<Listener>()
const kitchenTimers = new Map<string, ReturnType<typeof setTimeout>[]>()

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const mockStore = {
  get user() {
    return state.user
  },
  setUser(user: User | null) {
    state.user = user
    persist()
  },

  get addresses() {
    return state.addresses
  },
  addAddress(address: Address) {
    if (address.isDefault) state.addresses.forEach((a) => (a.isDefault = false))
    state.addresses.push(address)
    persist()
  },
  removeAddress(addressId: string) {
    const index = state.addresses.findIndex((a) => a.id === addressId)
    if (index === -1) return false
    state.addresses.splice(index, 1)
    persist()
    return true
  },

  get orders() {
    return state.orders
  },
  getOrder(orderId: string) {
    return state.orders.find((o) => o.id === orderId)
  },
  addOrder(order: Order) {
    state.orders.unshift(order)
    persist()
  },

  updateOrderStatus(orderId: string, status: OrderStatus, note: string | null = null) {
    const order = state.orders.find((o) => o.id === orderId)
    if (!order) return
    const previous = order.status
    order.status = status
    order.statusHistory = [...order.statusHistory, { status, at: new Date().toISOString(), note }]
    if (status === 'cancelled' && order.paymentMethod === 'card' && order.paymentStatus === 'paid') {
      order.paymentStatus = 'refund_pending'
      // The refund worker confirms via Stripe webhook in live mode; simulate the lag.
      setTimeout(() => {
        order.paymentStatus = 'refunded'
        persist()
        emit({
          type: 'order.status_changed',
          orderId,
          branchId: order.branchId,
          status: order.status,
          previousStatus: order.status,
          occurredAt: new Date().toISOString(),
        })
      }, 6000)
    }
    persist()
    emit({
      type: status === 'placed' ? 'order.placed' : 'order.status_changed',
      orderId,
      branchId: order.branchId,
      status,
      previousStatus: previous === status ? null : previous,
      occurredAt: new Date().toISOString(),
    })
  },

  /** Simulated kitchen: placed → accepted → preparing → ready/out_for_delivery → completed. */
  startKitchen(orderId: string) {
    const order = state.orders.find((o) => o.id === orderId)
    if (!order) return
    const handoff: OrderStatus = order.fulfillmentType === 'delivery' ? 'out_for_delivery' : 'ready'
    const script: [OrderStatus, number][] = [
      ['accepted', 8_000],
      ['preparing', 20_000],
      [handoff, 45_000],
      ['completed', 75_000],
    ]
    const timers = script.map(([status, delay]) =>
      setTimeout(() => {
        const current = state.orders.find((o) => o.id === orderId)
        // Kitchen never advances a cancelled/rejected order
        if (!current || ['cancelled', 'rejected'].includes(current.status)) return
        this.updateOrderStatus(orderId, status)
      }, delay),
    )
    kitchenTimers.set(orderId, timers)
  },

  stopKitchen(orderId: string) {
    kitchenTimers.get(orderId)?.forEach(clearTimeout)
    kitchenTimers.delete(orderId)
  },

  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

function emit(message: OrderChangedMessage) {
  listeners.forEach((l) => l(message))
}
