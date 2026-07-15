/**
 * Checkout derives its restaurant from the CART, not "the last restaurant
 * browsed" (plan §6.2.9 — the N=2 bug). With a seeded Deidos Grill basket on the
 * global /checkout route (no restaurant in the URL), the page must label and
 * scope itself to the cart's restaurant.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '@/App'
import { resetMockApiForTests } from '@/api/mock/api'
import { DUBLIN_BRANCH_ID, RESTAURANT_A_ID } from '@/api/mock/data'
import { mockAuthProvider } from '@/auth/mock'
import { V2_CART_KEY } from '@/cart/storage'

// jsdom stubs (IntersectionObserver, scrollTo, scrollIntoView) live in setup.ts.

const EMAIL = 'buyer@example.ie'
const PASSWORD = 'a-long-password!'

beforeEach(async () => {
  localStorage.clear()
  resetMockApiForTests()
  await mockAuthProvider.signUp(EMAIL, PASSWORD, 'Test Buyer')
  await mockAuthProvider.confirmSignUp(EMAIL, '123456')
  await mockAuthProvider.signIn(EMAIL, PASSWORD)
  // Seed a validated v2 basket for Deidos Grill's Dublin branch.
  localStorage.setItem(
    V2_CART_KEY,
    JSON.stringify({
      version: 2,
      restaurantId: RESTAURANT_A_ID,
      restaurantName: 'Deidos Grill',
      restaurantSlug: 'deidos-grill',
      branchId: DUBLIN_BRANCH_ID,
      branchName: 'Ranelagh',
      lines: [
        {
          key: `i-house-${DUBLIN_BRANCH_ID}|`,
          menuItemId: `i-house-${DUBLIN_BRANCH_ID}`,
          name: 'The House Special',
          imageUrl: null,
          unitPriceCents: 1450,
          quantity: 1,
          modifiers: [],
        },
      ],
    }),
  )
})

afterEach(() => cleanup())

describe('checkout scopes to the cart’s restaurant', () => {
  it('labels checkout with the cart’s restaurant and branch', async () => {
    window.history.pushState({}, '', '/checkout')
    render(<App />)

    await screen.findByRole('heading', { name: /checkout/i }, { timeout: 5000 })
    // The cart's restaurant name is shown (derived from cart.restaurantId).
    expect(await screen.findByText('Deidos Grill', {}, { timeout: 5000 })).toBeInTheDocument()
    // …alongside the cart's branch.
    expect(await screen.findByText('Ranelagh', {}, { timeout: 5000 })).toBeInTheDocument()
  }, 20000)
})
