/**
 * Cart domain logic — pure and unit-tested. The cart is client-held by design:
 * the platform has no server-side cart; the server reprices everything at
 * validate/checkout, so totals here are estimates for display only.
 */
import type { CartLineInput, MenuItem, ModifierOption } from '@/api/types'

export interface CartModifier {
  optionId: string
  name: string
  priceDeltaCents: number
}

export interface CartLine {
  /** Same item + same modifier set merge into one line. */
  key: string
  menuItemId: string
  name: string
  imageUrl: string | null
  unitPriceCents: number
  quantity: number
  modifiers: CartModifier[]
}

/**
 * A cart belongs to exactly one restaurant and one branch (one checkout = one
 * branch = one order, enforced by the platform). Restaurant identity travels
 * with the cart so global routes (checkout, cart bar) name it without re-deriving
 * from "the last restaurant browsed". `restaurantSlug` is display/navigation
 * cache — the authoritative link is the stable `restaurantId` (plan §6.2.5).
 */
export interface CartState {
  restaurantId: string | null
  restaurantName: string | null
  restaurantSlug: string | null
  branchId: string | null
  branchName: string | null
  lines: CartLine[]
}

export const emptyCart: CartState = {
  restaurantId: null,
  restaurantName: null,
  restaurantSlug: null,
  branchId: null,
  branchName: null,
  lines: [],
}

/** The restaurant a line is being added for (thread through from the menu route). */
export interface CartRestaurant {
  id: string
  name: string
  slug: string
}

export function lineKey(menuItemId: string, optionIds: string[]): string {
  return [menuItemId, ...[...optionIds].sort()].join('|')
}

export function buildLine(
  item: MenuItem,
  selectedOptions: ModifierOption[],
  quantity: number,
): CartLine {
  const modifiers = selectedOptions.map((o) => ({
    optionId: o.id,
    name: o.name,
    priceDeltaCents: o.priceDeltaCents,
  }))
  return {
    key: lineKey(item.id, modifiers.map((m) => m.optionId)),
    menuItemId: item.id,
    name: item.name,
    imageUrl: item.imageUrl ?? null,
    unitPriceCents: item.priceCents + modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0),
    quantity,
    modifiers,
  }
}

export type CartAction =
  | {
      type: 'add'
      restaurant: CartRestaurant
      branchId: string
      branchName: string
      line: CartLine
    }
  | { type: 'setQuantity'; key: string; quantity: number }
  | { type: 'remove'; key: string }
  | { type: 'load'; cart: CartState }
  | { type: 'clear' }

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      // Adding from a different branch (any restaurant) replaces the cart — the
      // caller confirms first (one cart = one restaurant = one branch).
      const sameBranch = state.branchId === action.branchId
      const lines = sameBranch ? state.lines : []
      const existing = lines.find((l) => l.key === action.line.key)
      const nextLines = existing
        ? lines.map((l) =>
            l.key === action.line.key
              ? { ...l, quantity: Math.min(l.quantity + action.line.quantity, 50) }
              : l,
          )
        : [...lines, action.line]
      return {
        restaurantId: action.restaurant.id,
        restaurantName: action.restaurant.name,
        restaurantSlug: action.restaurant.slug,
        branchId: action.branchId,
        branchName: action.branchName,
        lines: nextLines,
      }
    }
    // Replace the whole cart from restored/validated storage (migration result).
    case 'load':
      return action.cart
    case 'setQuantity': {
      if (action.quantity <= 0) {
        return cartReducer(state, { type: 'remove', key: action.key })
      }
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.key === action.key ? { ...l, quantity: Math.min(action.quantity, 50) } : l,
        ),
      }
    }
    case 'remove': {
      const lines = state.lines.filter((l) => l.key !== action.key)
      return lines.length === 0 ? emptyCart : { ...state, lines }
    }
    case 'clear':
      return emptyCart
  }
}

export function cartItemCount(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.quantity, 0)
}

/** Display estimate only — the server's priced cart is authoritative. */
export function cartSubtotalCents(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0)
}

/** Contract shape for POST cart/validate and /checkout. */
export function toCartLineInputs(state: CartState): CartLineInput[] {
  return state.lines.map((l) => ({
    menuItemId: l.menuItemId,
    quantity: l.quantity,
    ...(l.modifiers.length > 0
      ? { selectedModifierOptionIds: l.modifiers.map((m) => m.optionId) }
      : {}),
  }))
}
