/**
 * Checkout promo honesty (plan §8): the buyer is never silently charged more
 * than the price they were shown. While a promo is active the server quote
 * confirms it (with the "online offer" receipt line). If the promo expired
 * after the item went in the basket, the quote comes back HIGHER than the
 * basket displayed — checkout must then show the change and require an
 * explicit accept before the order can be placed. If the price rises in the
 * tiny gap between quote and checkout, the payment step calls it out (card)
 * or a toast + cancel window covers it (cash).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import {
  CORK_BRANCH_ID,
  DUBLIN_BRANCH_ID,
  RESTAURANT_A_ID,
  mockMarketplace,
  resetMarketplaceForTests,
} from '@/api/mock/data'
import { queryClient } from '@/api/query-client'
import { mockStore } from '@/api/mock/store'
import { mockAuthProvider } from '@/auth/mock'
import { V2_CART_KEY } from '@/cart/storage'

class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
vi.stubGlobal('IntersectionObserver', IO)
window.scrollTo = () => {}

const EMAIL = 'buyer@example.ie'
const PASSWORD = 'a-long-password!'

/** A basket holding the Dublin house special at its promo price (€11.50). */
function seedPromoCart(branchId = DUBLIN_BRANCH_ID, itemPrefix = 'i-house', priceCents = 1150) {
  localStorage.setItem(
    V2_CART_KEY,
    JSON.stringify({
      version: 2,
      restaurantId: RESTAURANT_A_ID,
      restaurantName: 'Deidos Grill',
      restaurantSlug: 'deidos-grill',
      branchId,
      branchName: branchId === DUBLIN_BRANCH_ID ? 'Ranelagh' : 'Washington Street',
      lines: [
        {
          key: `${itemPrefix}-${branchId}|`,
          menuItemId: `${itemPrefix}-${branchId}`,
          name: 'Seeded item',
          imageUrl: null,
          unitPriceCents: priceCents,
          quantity: 1,
          modifiers: [],
        },
      ],
    }),
  )
}

function renderCheckout() {
  window.history.pushState({}, '', '/checkout')
  return render(<App />)
}

beforeEach(async () => {
  localStorage.clear()
  queryClient.clear()
  mockStore.resetForTests()
  resetMarketplaceForTests()
  await mockAuthProvider.signUp(EMAIL, PASSWORD, 'Test Buyer')
  await mockAuthProvider.confirmSignUp(EMAIL, '123456')
  await mockAuthProvider.signIn(EMAIL, PASSWORD)
})

afterEach(() => cleanup())

describe('checkout with an ACTIVE promo', () => {
  it('confirms the promo price with an honest receipt line — no confirm gate', async () => {
    seedPromoCart()
    renderCheckout()

    // Wait for the branch to resolve — "Review order" is disabled until then.
    await screen.findByText('Ranelagh', {}, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /review order/i }))

    // The quote confirms the promo the basket displayed: €11.50, was €14.50.
    expect(await screen.findByText(/online offer — was/i, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /continue to payment · €11\.50/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/the kitchen's prices changed/i)).toBeNull()
  }, 20000)
})

describe('checkout after the promo EXPIRED (visible repricing)', () => {
  it('blocks placing until the buyer explicitly accepts the higher total', async () => {
    seedPromoCart()
    // The offer ended after the item went in the basket.
    mockMarketplace.promos = {}
    renderCheckout()

    await screen.findByText('Ranelagh', {}, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /review order/i }))

    // The repricing is loud: changed totals, both numbers, and NO place-order CTA.
    const alert = await screen.findByText(/the kitchen's prices changed/i, {}, { timeout: 5000 })
    expect(alert).toBeInTheDocument()
    expect(screen.getByText(/your basket showed/i)).toHaveTextContent('€11.50')
    expect(screen.queryByRole('button', { name: /continue to payment/i })).toBeNull()

    // Explicit consent, then the normal flow resumes at the new price.
    fireEvent.click(screen.getByRole('button', { name: /accept new total · €14\.50/i }))
    const placeButton = await screen.findByRole('button', {
      name: /continue to payment · €14\.50/i,
    })
    fireEvent.click(placeButton)
    expect(
      await screen.findByRole('heading', { name: /pay €14\.50/i }, { timeout: 5000 }),
    ).toBeInTheDocument()
  }, 20000)

  it('calls out a card total that rose between quote and checkout', async () => {
    seedPromoCart()
    renderCheckout()

    await screen.findByText('Ranelagh', {}, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /review order/i }))
    const place = await screen.findByRole(
      'button',
      { name: /continue to payment · €11\.50/i },
      { timeout: 5000 },
    )
    // The promo dies in the gap between the quote and the checkout call.
    mockMarketplace.promos = {}
    fireEvent.click(place)

    await screen.findByRole('heading', { name: /pay €14\.50/i }, { timeout: 5000 })
    expect(screen.getByText(/your total changed from/i)).toHaveTextContent('€11.50')
    expect(screen.getByText(/your total changed from/i)).toHaveTextContent('€14.50')
  }, 20000)

  it('a cash order repriced in that gap gets a toast and keeps the cancel window', async () => {
    // Cork accepts cash; its fries promo is €4.25 (was €5.95).
    seedPromoCart(CORK_BRANCH_ID, 'i-fries', 425)
    renderCheckout()

    // Pay with cash (Cork accepts it), then get the kitchen's quote.
    await screen.findByText('Washington Street', {}, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /cash on collection/i }))
    fireEvent.click(screen.getByRole('button', { name: /review order/i }))
    const place = await screen.findByRole(
      'button',
      { name: /place order · pay €4\.25 in cash/i },
      { timeout: 5000 },
    )
    mockMarketplace.promos = {}
    fireEvent.click(place)

    // The order is placed (cash commits immediately) — the change is disclosed
    // and the buyer still has the pre-acceptance cancel window.
    expect(
      await screen.findByText(/your total changed to €5\.95/i, {}, { timeout: 5000 }),
    ).toBeInTheDocument()
  }, 20000)
})
