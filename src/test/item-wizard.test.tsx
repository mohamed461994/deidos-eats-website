/**
 * The item customization wizard, driven through {@link ItemDetail} (the seam
 * the branch menu and home quick-add both render). Covers the gating /
 * auto-advance state machine, the summary jump-back edit loop, honest last-step
 * pricing + the cart payload, the branch-conflict swap, and the plain-detail /
 * unsatisfiable / sold-out edge cases (plan §7).
 *
 * Note: jsdom applies no CSS, so the responsive `hidden`/`sm:` panes (desktop
 * summary, mobile hero, mobile chip strip) all render at once. Queries therefore
 * target roles + heading level 3 (unique to the current step) rather than text.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MenuItem, ModifierGroup, ModifierOption } from '@/api/types'
import { CartProvider, useCart } from '@/cart/context'
import { ItemDetail } from '@/components/item-dialog'
import { ToastProvider } from '@/components/ui/toast'

/* ---- Fixtures + harness ------------------------------------------------ */

const opt = (id: string, name: string, priceDeltaCents = 0, isAvailable = true): ModifierOption => ({
  id,
  name,
  priceDeltaCents,
  isAvailable,
})

const grp = (
  id: string,
  name: string,
  minSelect: number,
  maxSelect: number,
  options: ModifierOption[],
): ModifierGroup => ({ id, name, minSelect, maxSelect, options })

function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-1',
    name: 'Test Item',
    description: null,
    priceCents: 1000,
    vatRateBasisPoints: 1350,
    imageUrl: null,
    isAvailable: true,
    allergens: [],
    modifierGroups: [],
    ...overrides,
  }
}

const RESTO = { id: 'r1', name: 'Test Resto', slug: 'test' }

/** Seeds a basket from a DIFFERENT branch so the next add triggers a conflict. */
function SeedConflict() {
  const { addItem } = useCart()
  return (
    <button
      onClick={() =>
        addItem({
          restaurant: { id: 'other', name: 'Other', slug: 'other' },
          branchId: 'bOther',
          branchName: 'Other Branch',
          item: makeItem({ id: 'seed', name: 'Seed' }),
          options: [],
          quantity: 1,
        })
      }
    >
      seed-conflict
    </button>
  )
}

/** Exposes the cart's contract payload so tests can assert the Add result. */
function CartProbe() {
  const { lineInputs } = useCart()
  return <div data-testid="cart">{JSON.stringify(lineInputs)}</div>
}

function renderItem(menuItem: MenuItem) {
  return render(
    <CartProvider>
      <ToastProvider>
        <SeedConflict />
        <ItemDetail
          item={menuItem}
          restaurant={RESTO}
          branchId="b1"
          branchName="Test Branch"
          onClose={() => {}}
        />
        <CartProbe />
      </ToastProvider>
    </CartProvider>,
  )
}

/** Fire the 350 ms auto-advance timer (tests opt into fake timers first). */
function runAutoAdvance() {
  act(() => vi.advanceTimersByTime(400))
}

const stepHeading = (name: string) => screen.getByRole('heading', { name, level: 3 })

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
  localStorage.clear()
})

/* ---- Gating + auto-advance --------------------------------------------- */

describe('required single-choice (1×1)', () => {
  it('gates Next until a pick, then auto-advances', () => {
    vi.useFakeTimers()
    renderItem(
      makeItem({
        modifierGroups: [
          grp('size', 'Size', 1, 1, [opt('reg', 'Regular'), opt('lg', 'Large', 300)]),
          grp('dips', 'Dips', 0, 2, [opt('a', 'Aioli'), opt('b', 'Honey')]),
        ],
      }),
    )
    expect(stepHeading('Size')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: 'Regular' }))
    runAutoAdvance()
    expect(stepHeading('Dips')).toBeInTheDocument()
  })
})

describe('exact-count (2×2)', () => {
  it('holds at one, caps selection, advances at two', () => {
    vi.useFakeTimers()
    renderItem(
      makeItem({
        modifierGroups: [
          grp('dips', 'Dips', 2, 2, [opt('a', 'Aioli'), opt('b', 'Honey'), opt('c', 'Pesto')]),
          grp('drink', 'Drink', 1, 1, [opt('cola', 'Cola')]),
        ],
      }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Aioli' }))
    runAutoAdvance()
    expect(stepHeading('Dips')).toBeInTheDocument() // one pick: no advance

    fireEvent.click(screen.getByRole('checkbox', { name: 'Honey' }))
    // At the cap, the remaining option is proactively disabled.
    expect(screen.getByRole('checkbox', { name: 'Pesto' })).toBeDisabled()
    runAutoAdvance()
    expect(stepHeading('Drink')).toBeInTheDocument() // two picks: advanced
  })
})

describe('ranged (1–2)', () => {
  it('enables Next at one, never auto-advances, re-disables on deselect', () => {
    vi.useFakeTimers()
    renderItem(
      makeItem({
        modifierGroups: [
          grp('top', 'Toppings', 1, 2, [opt('p', 'Pepperoni'), opt('m', 'Mushroom')]),
          grp('drink', 'Drink', 1, 1, [opt('cola', 'Cola')]),
        ],
      }),
    )
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pepperoni' }))
    runAutoAdvance()
    expect(stepHeading('Toppings')).toBeInTheDocument() // ranged never auto-advances
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pepperoni' })) // deselect
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()
  })
})

describe('optional (0–N)', () => {
  it('offers Skip at zero and Next at one', () => {
    renderItem(
      makeItem({
        modifierGroups: [
          grp('ex', 'Extras', 0, 3, [opt('a', 'Cheese'), opt('b', 'Rocket')]),
          grp('drink', 'Drink', 1, 1, [opt('cola', 'Cola')]),
        ],
      }),
    )
    expect(screen.getByRole('button', { name: /^skip$/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cheese' }))
    expect(screen.queryByRole('button', { name: /^skip$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()
  })
})

/* ---- Navigation -------------------------------------------------------- */

describe('Back', () => {
  it('returns to the previous step with selections intact and no bounce', () => {
    vi.useFakeTimers()
    renderItem(
      makeItem({
        modifierGroups: [
          grp('size', 'Size', 1, 1, [opt('reg', 'Regular'), opt('lg', 'Large')]),
          grp('ex', 'Extras', 0, 3, [opt('a', 'Cheese')]),
        ],
      }),
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Regular' }))
    runAutoAdvance()
    expect(stepHeading('Extras')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /back to the previous step/i }))
    expect(stepHeading('Size')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Regular' })).toBeChecked()
    // Arriving at an already-complete single-choice step must not bounce forward.
    runAutoAdvance()
    expect(stepHeading('Size')).toBeInTheDocument()
  })
})

describe('summary jump-back', () => {
  it('edits an earlier step then returns to the furthest step', () => {
    vi.useFakeTimers()
    renderItem(
      makeItem({
        modifierGroups: [
          grp('size', 'Size', 1, 1, [opt('reg', 'Regular'), opt('lg', 'Large', 300)]),
          grp('sauce', 'Sauce', 1, 1, [opt('t', 'Tomato'), opt('g', 'Garlic')]),
          grp('ex', 'Extras', 0, 3, [opt('a', 'Cheese')]),
        ],
      }),
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Regular' }))
    runAutoAdvance() // → Sauce
    fireEvent.click(screen.getByRole('radio', { name: 'Tomato' }))
    runAutoAdvance() // → Extras (furthest)
    expect(stepHeading('Extras')).toBeInTheDocument()

    // Jump back to Size via the summary; it stays put (the fix), then a change
    // auto-advances back to the furthest step.
    fireEvent.click(screen.getByRole('button', { name: /^edit size/i }))
    expect(stepHeading('Size')).toBeInTheDocument()
    runAutoAdvance()
    expect(stepHeading('Size')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Large/ }))
    runAutoAdvance()
    expect(stepHeading('Extras')).toBeInTheDocument()
  })
})

/* ---- Pricing + cart payload -------------------------------------------- */

describe('last-step Add', () => {
  it('prices from promo + deltas × quantity and submits the chosen option ids', () => {
    renderItem(
      makeItem({
        id: 'promo-1',
        priceCents: 1450,
        onlinePromoPriceCents: 1150,
        modifierGroups: [grp('size', 'Size', 1, 1, [opt('reg', 'Regular'), opt('lg', 'Large', 300)])],
      }),
    )
    // A single required group is the last step (no auto-advance guard fires).
    fireEvent.click(screen.getByRole('radio', { name: /Large/ }))
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }))

    const add = screen.getByRole('button', { name: /^add ·/i })
    expect(add).toHaveTextContent('€29.00') // (1150 promo + 300) × 2

    fireEvent.click(add)
    expect(JSON.parse(screen.getByTestId('cart').textContent!)).toEqual([
      { menuItemId: 'promo-1', quantity: 2, selectedModifierOptionIds: ['lg'] },
    ])
  })
})

/* ---- Branch conflict --------------------------------------------------- */

describe('branch conflict', () => {
  it('confirms Keep (no change) then Clear (replace) when a rival basket exists', () => {
    renderItem(
      makeItem({ id: 'x', modifierGroups: [grp('size', 'Size', 1, 1, [opt('reg', 'Regular')])] }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'seed-conflict' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Regular' }))
    fireEvent.click(screen.getByRole('button', { name: /^add ·/i }))

    // Conflict swap: Keep leaves the rival basket, Clear replaces it.
    fireEvent.click(screen.getByRole('button', { name: /^keep/i }))
    expect(screen.queryByRole('button', { name: /clear & start/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^add ·/i }))
    fireEvent.click(screen.getByRole('button', { name: /clear & start/i }))
    expect(JSON.parse(screen.getByTestId('cart').textContent!)).toEqual([
      { menuItemId: 'x', quantity: 1, selectedModifierOptionIds: ['reg'] },
    ])
  })
})

/* ---- Edge cases -------------------------------------------------------- */

describe('edge cases', () => {
  it('renders plain detail (no wizard) for a zero-group item', () => {
    renderItem(makeItem({ id: 'drink', name: 'Cola', modifierGroups: [] }))
    expect(screen.queryByText(/step 1 of/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /^next$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^add ·/i })).toHaveTextContent('€10.00')
  })

  it('blocks and explains an unsatisfiable required group', () => {
    renderItem(
      makeItem({
        modifierGroups: [grp('sauce', 'Sauce', 2, 2, [opt('a', 'A'), opt('b', 'B', 0, false)])],
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/not enough options/i)
    expect(screen.getByRole('button', { name: /^add ·/i })).toBeDisabled()
  })

  it('disables and marks a sold-out option', () => {
    renderItem(
      makeItem({
        modifierGroups: [grp('top', 'Toppings', 0, 3, [opt('a', 'Cheese'), opt('b', 'Nduja', 0, false)])],
      }),
    )
    expect(screen.getByRole('checkbox', { name: /Nduja/ })).toBeDisabled()
    expect(screen.getByText('Sold out')).toBeInTheDocument()
  })
})
