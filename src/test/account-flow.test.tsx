/**
 * End-to-end (jsdom) reproduction of the reported bug: "after login /account
 * only shows the email — no name, no phone, no address". Mounts the REAL App
 * (all providers, router, pages) and drives the actual UI:
 * signup → confirm → auto sign-in → /account.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'

// jsdom lacks IntersectionObserver (menu page) and scrollTo is a no-op stub.
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

const EMAIL = 'sean.murphy@example.ie'
const PASSWORD = 'a-long-password!'

function setField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

beforeEach(() => {
  localStorage.clear()
  window.history.pushState({}, '', '/signup')
})

afterEach(() => {
  cleanup()
})

describe('account page after a fresh signup + login', () => {
  it('shows the signup name, then persisted phone and address', async () => {
    render(<App />)

    // --- signup step
    setField(/full name/i, 'Seán Murphy')
    setField(/email/i, EMAIL)
    setField(/^password/i, PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // --- confirm step (mock accepts any 6 digits), auto signs in, navigates to /menu
    await screen.findByLabelText(/confirmation code/i, {}, { timeout: 5000 })
    setField(/confirmation code/i, '123456')
    fireEvent.click(screen.getByRole('button', { name: /confirm and sign in/i }))

    // signed-in header shows the first name once /me resolves
    await screen.findByText('Seán', {}, { timeout: 5000 })

    // The confirm → sign-in flow redirects to /menu, and that sign-in awaits a
    // full query invalidation first (auth/context.tsx). Wait for the redirect to
    // actually land before navigating on, otherwise it can fire late and bounce
    // us off /account.
    await waitFor(() => expect(window.location.pathname).toBe('/menu'), { timeout: 5000 })

    // --- go to the account page (header account link)
    fireEvent.click(screen.getByRole('link', { name: /your account/i }))

    // email + full name in the page header
    await screen.findByText(EMAIL, {}, { timeout: 5000 })
    await screen.findByText('Seán Murphy', {}, { timeout: 5000 })

    // profile form is pre-filled with the signup name
    await waitFor(
      () => expect(screen.getByLabelText(/full name/i)).toHaveValue('Seán Murphy'),
      { timeout: 5000 },
    )

    // --- set a phone number and save
    setField(/phone/i, '0851234567')
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await screen.findByText(/profile saved/i, {}, { timeout: 5000 })

    // --- add an address
    fireEvent.click(screen.getByRole('button', { name: /add address/i }))
    setField(/address line 1/i, '4 Main Street')
    setField(/town/i, 'Ranelagh')
    setField(/county/i, 'Dublin')
    setField(/eircode/i, 'D06C7W2')
    fireEvent.click(screen.getByRole('button', { name: /save address/i }))
    await screen.findByText(/address saved/i, {}, { timeout: 5000 })
    // rendered twice: as the address label fallback and in the detail line
    const shown = await screen.findAllByText(/4 Main Street/i, {}, { timeout: 5000 })
    expect(shown.length).toBeGreaterThan(0)
  }, 30000)
})
