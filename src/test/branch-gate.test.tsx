/**
 * The menu must never silently default to a branch. With more than one branch
 * and no explicit choice, the page shows an inline chooser (the "gate") instead
 * of a menu — so a Cork customer is never handed the Dublin menu by accident.
 * Drives the real <App/> at /menu (a public route — no sign-in needed).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { DUBLIN_BRANCH_ID } from '@/api/mock/data'

// jsdom lacks IntersectionObserver (menu scrollspy); scrollTo is a no-op stub.
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

const BRANCH_KEY = 'puca-branch-v1'
const GATE_HEADING = /is yours/i
// A category name appears twice on the loaded menu (sticky nav link + section
// heading), so we assert on the section heading role, not bare text.
const A_MENU_CATEGORY = /wood-fired pizzas/i

function renderMenu() {
  window.history.pushState({}, '', '/menu')
  return render(<App />)
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('menu branch gate', () => {
  it('shows the chooser (not the menu) when nothing is selected, then loads the menu on choice', async () => {
    renderMenu()

    // Gate appears once the restaurant loads; the menu is absent.
    await screen.findByRole('heading', { name: GATE_HEADING }, { timeout: 5000 })
    expect(screen.queryByRole('heading', { name: A_MENU_CATEGORY })).toBeNull()

    // Choosing a branch loads its menu in place, and the gate goes away.
    const orderButtons = await screen.findAllByRole(
      'button',
      { name: /order here/i },
      { timeout: 5000 },
    )
    fireEvent.click(orderButtons[0])

    await screen.findByRole('heading', { name: A_MENU_CATEGORY }, { timeout: 5000 })
    expect(screen.queryByRole('heading', { name: GATE_HEADING })).toBeNull()
  }, 20000)

  it('skips the gate when a valid branch is already stored', async () => {
    localStorage.setItem(BRANCH_KEY, DUBLIN_BRANCH_ID)
    renderMenu()

    await screen.findByRole('heading', { name: A_MENU_CATEGORY }, { timeout: 5000 })
    expect(screen.queryByRole('heading', { name: GATE_HEADING })).toBeNull()
  }, 20000)

  it('shows the gate when the stored branch id is stale', async () => {
    localStorage.setItem(BRANCH_KEY, 'no-such-branch')
    renderMenu()

    await screen.findByRole('heading', { name: GATE_HEADING }, { timeout: 5000 })
    expect(screen.queryByRole('heading', { name: A_MENU_CATEGORY })).toBeNull()
  }, 20000)
})
