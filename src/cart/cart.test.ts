import { describe, expect, it } from 'vitest'

import type { MenuItem } from '@/api/types'

import {
  buildLine,
  cartItemCount,
  cartReducer,
  cartSubtotalCents,
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

function add(state: CartState, item: MenuItem, options = [] as typeof pizza.modifierGroups extends undefined ? never[] : (typeof nduja)[], quantity = 1) {
  return cartReducer(state, {
    type: 'add',
    branchId: 'branch-1',
    branchName: 'Púca Ranelagh',
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
      branchId: 'branch-2',
      branchName: 'Púca Washington Street',
      line: buildLine(pizza, [], 1),
    })
    expect(next.branchId).toBe('branch-2')
    expect(next.lines).toHaveLength(1)
    expect(next.lines[0].quantity).toBe(1)
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
})
