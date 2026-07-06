/**
 * End-to-end exercise of the mock ordering flow — the same sequence the UI
 * drives: sign in → price cart → checkout → pay → kitchen lifecycle → cancel
 * rules. Guards the mock's parity with the real API's documented behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockAuthProvider } from '@/auth/mock'

import { ApiError } from '../errors'
import {
  cancelMyOrder,
  checkout,
  getMyOrder,
  listMyOrders,
  mockConfirmCardPayment,
  validateCart,
} from './api'
import { DUBLIN_BRANCH_ID, menus } from './data'
import { mockStore } from './store'

const pizzaId = menus[DUBLIN_BRANCH_ID].categories[0].items[0].id
const ndujaOptionId = menus[DUBLIN_BRANCH_ID].categories[0].items[0].modifierGroups![0].options[1].id

async function settle<T>(promise: Promise<T>, ms = 2000): Promise<T> {
  // Attach a handler before advancing timers so an early rejection isn't "unhandled"
  promise.catch(() => {})
  await vi.advanceTimersByTimeAsync(ms)
  return promise
}

beforeEach(async () => {
  vi.useFakeTimers()
  localStorage.clear()
  mockStore.orders.length = 0
  await settle(mockAuthProvider.signIn('demo@puca.ie', 'a-long-password!'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mock ordering flow', () => {
  it('prices a cart server-side with VAT-inclusive breakdown and delivery fee', async () => {
    const priced = await settle(
      validateCart(DUBLIN_BRANCH_ID, {
        fulfillmentType: 'delivery',
        addressId: mockStore.addresses[0].id,
        lines: [{ menuItemId: pizzaId, quantity: 2, selectedModifierOptionIds: [ndujaOptionId] }],
      }),
    )
    // The Púca 1450 + nduja 200 = 1650 unit, ×2 = 3300 + 290 delivery
    expect(priced.lines[0].unitPriceCents).toBe(1650)
    expect(priced.subtotalCents).toBe(3300)
    expect(priced.deliveryFeeCents).toBe(290)
    expect(priced.totalCents).toBe(3590)
    const vat = priced.vatBreakdown[0]
    expect(vat.rateBasisPoints).toBe(1350)
    expect(vat.netCents + vat.vatCents).toBe(3300)
  })

  it('rejects delivery below the branch minimum with the server error code', async () => {
    const drinksId = menus[DUBLIN_BRANCH_ID].categories[4].items[0].id
    await expect(
      settle(
        validateCart(DUBLIN_BRANCH_ID, {
          fulfillmentType: 'delivery',
          addressId: mockStore.addresses[0].id,
          lines: [{ menuItemId: drinksId, quantity: 1 }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'below_minimum_order' })
  })

  it('runs a card order through payment and the full kitchen lifecycle', async () => {
    const response = await settle(
      checkout(
        {
          branchId: DUBLIN_BRANCH_ID,
          fulfillmentType: 'collection',
          lines: [{ menuItemId: pizzaId, quantity: 1 }],
          paymentMethod: 'card',
        },
        'test-key-lifecycle',
      ),
    )
    expect(response.paymentIntentClientSecret).toBeTruthy()

    let order = await settle(getMyOrder(response.orderId))
    expect(order.status).toBe('placed')
    expect(order.paymentStatus).toBe('requires_payment')

    await settle(mockConfirmCardPayment(response.orderId))
    order = await settle(getMyOrder(response.orderId))
    expect(order.paymentStatus).toBe('paid')

    // Kitchen script: accepted @8s, preparing @20s, ready @45s, completed @75s
    await vi.advanceTimersByTimeAsync(80_000)
    order = await settle(getMyOrder(response.orderId))
    expect(order.status).toBe('completed')
    expect(order.statusHistory.map((h) => h.status)).toEqual([
      'placed',
      'accepted',
      'preparing',
      'ready',
      'completed',
    ])
  })

  it('is idempotent on the checkout Idempotency-Key', async () => {
    const first = await settle(
      checkout(
        {
          branchId: DUBLIN_BRANCH_ID,
          fulfillmentType: 'collection',
          lines: [{ menuItemId: pizzaId, quantity: 1 }],
        },
        'retry-key',
      ),
    )
    const second = await settle(
      checkout(
        {
          branchId: DUBLIN_BRANCH_ID,
          fulfillmentType: 'collection',
          lines: [{ menuItemId: pizzaId, quantity: 1 }],
        },
        'retry-key',
      ),
    )
    expect(second.orderId).toBe(first.orderId)
    const orders = await settle(listMyOrders())
    expect(orders.items.filter((o) => o.id === first.orderId)).toHaveLength(1)
  })

  it('allows cancellation only while placed, then refunds card payments', async () => {
    const response = await settle(
      checkout(
        {
          branchId: DUBLIN_BRANCH_ID,
          fulfillmentType: 'collection',
          lines: [{ menuItemId: pizzaId, quantity: 1 }],
          paymentMethod: 'card',
        },
        'cancel-key',
      ),
    )
    await settle(mockConfirmCardPayment(response.orderId))

    const cancelled = await settle(cancelMyOrder(response.orderId, 'changed my mind'))
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.paymentStatus).toBe('refund_pending')

    // Kitchen must never advance a cancelled order; refund confirms async
    await vi.advanceTimersByTimeAsync(90_000)
    const final = await settle(getMyOrder(response.orderId))
    expect(final.status).toBe('cancelled')
    expect(final.paymentStatus).toBe('refunded')
  })

  it('refuses to cancel once the kitchen accepted', async () => {
    const response = await settle(
      checkout(
        {
          branchId: DUBLIN_BRANCH_ID,
          fulfillmentType: 'collection',
          lines: [{ menuItemId: pizzaId, quantity: 1 }],
          paymentMethod: 'card',
        },
        'too-late-key',
      ),
    )
    await settle(mockConfirmCardPayment(response.orderId))
    await vi.advanceTimersByTimeAsync(10_000) // past accepted @8s

    try {
      await settle(cancelMyOrder(response.orderId))
      expect.unreachable('cancel should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe('order_not_cancellable')
    }
  })

  it('emits websocket-shaped events as the order moves', async () => {
    const events: string[] = []
    const unsubscribe = mockStore.subscribe((message) => {
      events.push(`${message.type}:${message.status}`)
    })
    const response = await settle(
      checkout(
        {
          branchId: DUBLIN_BRANCH_ID,
          fulfillmentType: 'delivery',
          addressId: mockStore.addresses[0].id,
          lines: [{ menuItemId: pizzaId, quantity: 2 }],
          paymentMethod: 'card',
        },
        'events-key',
      ),
    )
    await settle(mockConfirmCardPayment(response.orderId))
    await vi.advanceTimersByTimeAsync(80_000)
    unsubscribe()
    expect(events).toEqual([
      'order.status_changed:accepted',
      'order.status_changed:preparing',
      'order.status_changed:out_for_delivery',
      'order.status_changed:completed',
    ])
  })
})
