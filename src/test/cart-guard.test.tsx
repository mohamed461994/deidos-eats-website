/**
 * One cart = one restaurant = one branch. The destructive prompt fires ONLY when
 * a different-restaurant/branch item is actually added; cancelling leaves the
 * original basket intact (plan §6.2.4). Driven at the context level (the source
 * of truth the ItemDialog and "Order again" both go through).
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MenuItem } from '@/api/types'
import { CartProvider, useCart } from '@/cart/context'

const item = (id: string): MenuItem => ({
  id,
  name: id,
  description: null,
  priceCents: 1000,
  vatRateBasisPoints: 1350,
  imageUrl: null,
  isAvailable: true,
  allergens: [],
})

const grill = { id: 'rest-A', name: 'Deidos Grill', slug: 'deidos-grill' }
const nonna = { id: 'rest-B', name: "Nonna's Table", slug: 'nonnas-table' }

const wrapper = ({ children }: { children: React.ReactNode }) => <CartProvider>{children}</CartProvider>

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('cross-restaurant cart guard', () => {
  it('carries restaurant identity and only conflicts when a B item is actually added', () => {
    const { result } = renderHook(() => useCart(), { wrapper })

    act(() => {
      result.current.addItem({
        restaurant: grill,
        branchId: 'branch-A1',
        branchName: 'Ranelagh',
        item: item('burger'),
        options: [],
        quantity: 1,
      })
    })
    expect(result.current.cart.restaurantId).toBe('rest-A')
    expect(result.current.cart.restaurantName).toBe('Deidos Grill')
    expect(result.current.itemCount).toBe(1)

    // Adding ANOTHER A item is not a conflict — it just adds.
    let outcome = ''
    act(() => {
      outcome = result.current.addItem({
        restaurant: grill,
        branchId: 'branch-A1',
        branchName: 'Ranelagh',
        item: item('fries'),
        options: [],
        quantity: 1,
      }).outcome
    })
    expect(outcome).toBe('added')
    expect(result.current.itemCount).toBe(2)
  })

  it('conflicts on a B add, keeps A on cancel, switches to B on force', () => {
    const { result } = renderHook(() => useCart(), { wrapper })

    act(() => {
      result.current.addItem({
        restaurant: grill,
        branchId: 'branch-A1',
        branchName: 'Ranelagh',
        item: item('burger'),
        options: [],
        quantity: 1,
      })
    })

    // Adding a Nonna's item conflicts (no force) — cart is untouched (cancel path).
    let outcome = ''
    act(() => {
      outcome = result.current.addItem({
        restaurant: nonna,
        branchId: 'branch-B1',
        branchName: 'Quay Street',
        item: item('pasta'),
        options: [],
        quantity: 1,
      }).outcome
    })
    expect(outcome).toBe('conflict')
    expect(result.current.cart.restaurantId).toBe('rest-A') // A still intact
    expect(result.current.itemCount).toBe(1)

    // Confirming (force) clears A and starts B.
    act(() => {
      result.current.addItem({
        restaurant: nonna,
        branchId: 'branch-B1',
        branchName: 'Quay Street',
        item: item('pasta'),
        options: [],
        quantity: 1,
        force: true,
      })
    })
    expect(result.current.cart.restaurantId).toBe('rest-B')
    expect(result.current.cart.restaurantName).toBe("Nonna's Table")
    expect(result.current.itemCount).toBe(1)
  })
})
