import { describe, expect, it } from 'vitest'

import type { MenuItem } from '@/api/types'

import {
  buildLine,
  cartItemCount,
  cartReducer,
  cartSubtotalCents,
  compareQuoteToBasket,
  emptyCart,
  toCartLineInputs,
  type CartState,
} from './cart'

const pizza: MenuItem = {
  id: 'item-1',
  name: 'Margherita',
  description: null,
  priceCents: 1150,
  vatRateBasisPoints: 1350,
  imageUrl: null,
  isAvailable: true,
  allergens: ['gluten', 'milk'],
  modifierGroups: [
    {
      id: 'g1',
      name: 'Extra toppings',
      minSelect: 0,
      maxSelect: 3,
      options: [
        { id: 'o1', name: 'Nduja', priceDeltaCents: 200, isAvailable: true },
        { id: 'o2', name: 'Red onion', priceDeltaCents: 75, isAvailable: true },
      ],
    },
  ],
}

const nduja = pizza.modifierGroups![0].options[0]
const onion = pizza.modifierGroups![0].options[1]

const restaurantA = { id: 'rest-1', name: 'Deidos Grill', slug: 'deidos-grill' }
const restaurantB = { id: 'rest-2', name: "Nonna's Table", slug: 'nonnas-table' }

function add(state: CartState, item: MenuItem, options = [] as typeof pizza.modifierGroups extends undefined ? never[] : (typeof nduja)[], quantity = 1) {
  return cartReducer(state, {
    type: 'add',
    restaurant: restaurantA,
    branchId: 'branch-1',
    branchName: 'Ranelagh',
    line: buildLine(item, options, quantity),
  })
}

describe('cartReducer', () => {
  it('adds a line with modifier pricing baked into the unit price', () => {
    const state = add(emptyCart, pizza, [nduja], 2)
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0].unitPriceCents).toBe(1350)
    expect(cartSubtotalCents(state)).toBe(2700)
    expect(cartItemCount(state)).toBe(2)
  })

  it('merges identical item + modifier sets and keeps different sets apart', () => {
    let state = add(emptyCart, pizza, [nduja])
    state = add(state, pizza, [nduja])
    state = add(state, pizza, [onion])
    expect(state.lines).toHaveLength(2)
    expect(state.lines[0].quantity).toBe(2)
  })

  it('treats modifier order as irrelevant to line identity', () => {
    let state = add(emptyCart, pizza, [nduja, onion])
    state = add(state, pizza, [onion, nduja])
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0].quantity).toBe(2)
  })

  it('replaces the cart when adding from a different branch', () => {
    const state = add(emptyCart, pizza)
    const next = cartReducer(state, {
      type: 'add',
      restaurant: restaurantA,
      branchId: 'branch-2',
      branchName: 'Washington Street',
      line: buildLine(pizza, [], 1),
    })
    expect(next.branchId).toBe('branch-2')
    expect(next.lines).toHaveLength(1)
    expect(next.lines[0].quantity).toBe(1)
  })

  it('carries restaurant identity onto the cart and swaps it on a cross-restaurant add', () => {
    const a = add(emptyCart, pizza)
    expect(a.restaurantId).toBe('rest-1')
    expect(a.restaurantName).toBe('Deidos Grill')
    expect(a.restaurantSlug).toBe('deidos-grill')
    const b = cartReducer(a, {
      type: 'add',
      restaurant: restaurantB,
      branchId: 'branch-9',
      branchName: 'Quay Street',
      line: buildLine(pizza, [], 1),
    })
    expect(b.restaurantId).toBe('rest-2')
    expect(b.restaurantName).toBe("Nonna's Table")
    expect(b.lines).toHaveLength(1)
  })

  it('removes a line at quantity zero and resets branch when empty', () => {
    const state = add(emptyCart, pizza)
    const next = cartReducer(state, { type: 'setQuantity', key: state.lines[0].key, quantity: 0 })
    expect(next).toEqual(emptyCart)
  })

  it('caps quantities at 50 (contract line limit)', () => {
    const state = add(emptyCart, pizza, [], 49)
    const next = cartReducer(state, { type: 'setQuantity', key: state.lines[0].key, quantity: 99 })
    expect(next.lines[0].quantity).toBe(50)
  })

  it('produces contract-shaped line inputs', () => {
    const state = add(emptyCart, pizza, [nduja])
    expect(toCartLineInputs(state)).toEqual([
      { menuItemId: 'item-1', quantity: 1, selectedModifierOptionIds: ['o1'] },
    ])
  })

  it('prices a line at the active online promo (what the buyer is charged)', () => {
    const onOffer: MenuItem = {
      ...pizza,
      onlinePromoPriceCents: 950,
      promoEndsAt: '2026-07-13T20:00:00.000Z',
    }
    // Promo price + modifier delta; base price is not part of the estimate.
    expect(buildLine(onOffer, [nduja], 1).unitPriceCents).toBe(1150)
    expect(buildLine(onOffer, [], 1).unitPriceCents).toBe(950)
    // No active promo (null or absent) → base price, unchanged behavior.
    expect(buildLine({ ...pizza, onlinePromoPriceCents: null }, [], 1).unitPriceCents).toBe(1150)
  })
})

describe('compareQuoteToBasket', () => {
  const basket = add(emptyCart, pizza, [], 2) // displayed at 1150 × 2 = 2300

  const quoteLine = (unitPriceCents: number, menuItemId = 'item-1') => ({
    menuItemId,
    name: 'Margherita',
    quantity: 2,
    unitPriceCents,
    lineTotalCents: unitPriceCents * 2,
    vatRateBasisPoints: 1350,
  })

  it('flags an upward reprice and pairs each priced line with its basket total', () => {
    const result = compareQuoteToBasket(basket, {
      subtotalCents: 2900,
      lines: [quoteLine(1450)],
    })
    expect(result.repricedUp).toBe(true)
    expect(result.displayedSubtotalCents).toBe(2300)
    expect(result.basketLineTotals).toEqual([2300])
  })

  it('does not flag an equal or cheaper quote (charging less than shown is fine)', () => {
    expect(
      compareQuoteToBasket(basket, { subtotalCents: 2300, lines: [quoteLine(1150)] }).repricedUp,
    ).toBe(false)
    expect(
      compareQuoteToBasket(basket, { subtotalCents: 1900, lines: [quoteLine(950)] }).repricedUp,
    ).toBe(false)
  })

  it('returns null for a priced line it cannot pair with the basket', () => {
    const result = compareQuoteToBasket(basket, {
      subtotalCents: 2900,
      lines: [quoteLine(1450, 'other-item')],
    })
    expect(result.basketLineTotals).toEqual([null])
  })
})
