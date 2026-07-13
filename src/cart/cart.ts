/**
 * Cart domain logic — pure and unit-tested. The cart is client-held by design:
 * the platform has no server-side cart; the server reprices everything at
 * validate/checkout, so totals here are estimates for display only.
 */
import type { CartLineInput, MenuItem, ModifierOption, PricedCart } from '@/api/types'

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

/**
 * THE effective online unit price: the active promo price when one applies
 * (`onlinePromoPriceCents` is only ever non-null while active), else base,
 * plus the selected modifier deltas. Every client-side estimate — cart lines,
 * the item dialog's CTA — derives from this one helper so the displayed price
 * can never drift between surfaces; the server re-prices authoritatively at
 * validate/checkout.
 */
export function effectiveUnitPriceCents(
  item: Pick<MenuItem, 'priceCents' | 'onlinePromoPriceCents'>,
  selectedOptions: readonly Pick<ModifierOption, 'priceDeltaCents'>[],
): number {
  return (
    (item.onlinePromoPriceCents ?? item.priceCents) +
    selectedOptions.reduce((sum, option) => sum + option.priceDeltaCents, 0)
  )
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
    unitPriceCents: effectiveUnitPriceCents(item, selectedOptions),
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

/**
 * How the kitchen's quote relates to what the basket displayed — the promo
 * honesty check (plan §8). `repricedUp` means the server priced the items
 * ABOVE the basket's estimate (a promo expired since adding); checkout must
 * then show the change and require explicit buyer acceptance. Priced lines
 * answer the request's lines in order, so the per-line join is by index with
 * a menuItemId guard.
 */
export interface QuoteComparison {
  /** What the basket showed the buyer (the client-side estimate). */
  displayedSubtotalCents: number
  /** True when the quote's items subtotal exceeds the displayed estimate. */
  repricedUp: boolean
  /** Per priced line: the basket's line total it answers, or null when unmatched. */
  basketLineTotals: Array<number | null>
}

export function compareQuoteToBasket(
  state: CartState,
  quote: Pick<PricedCart, 'subtotalCents' | 'lines'>,
): QuoteComparison {
  const displayedSubtotalCents = cartSubtotalCents(state)
  return {
    displayedSubtotalCents,
    repricedUp: quote.subtotalCents > displayedSubtotalCents,
    basketLineTotals: quote.lines.map((line, index) => {
      const basketLine = state.lines[index]
      return basketLine && basketLine.menuItemId === line.menuItemId
        ? basketLine.unitPriceCents * basketLine.quantity
        : null
    }),
  }
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
