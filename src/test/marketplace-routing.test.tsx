/**
 * Marketplace routing against the two-restaurant mock: the retained
 * `/restaurants` card page → `/r/:slug` → branch-in-URL menu, plus soft-404
 * for unknown slugs and the unavailable states (coming-soon, paused). The
 * branch-first home page (`/`) has its own suite (home-page.test.tsx).
 * Drives the REAL <App/> (router, providers, pages).
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
Element.prototype.scrollIntoView = () => {}

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('marketplace routing', () => {
  it('the retained /restaurants page still lists both restaurants as cards', async () => {
    renderAt('/restaurants')
    await screen.findByRole('heading', { name: /choose a restaurant/i }, { timeout: 5000 })
    expect(await screen.findByRole('heading', { name: 'Deidos Grill' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: "Nonna's Table" })).toBeInTheDocument()
    // No dead marketplace chrome.
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('a /restaurants card links into the restaurant home (slug in the URL)', async () => {
    renderAt('/restaurants')
    const link = await screen.findByRole('link', { name: /Deidos Grill/i }, { timeout: 5000 })
    fireEvent.click(link)
    expect(window.location.pathname).toBe('/r/deidos-grill')
    await screen.findByRole('heading', { name: 'Deidos Grill', level: 1 }, { timeout: 5000 })
  })

  it('resolves a branch-in-URL menu route and shows that branch', async () => {
    renderAt(`/r/deidos-grill/b/${DUBLIN_BRANCH_ID}/menu`)
    // A category heading proves the menu for THIS branch loaded.
    await screen.findByRole('heading', { name: /from the grill/i }, { timeout: 5000 })
    expect(await screen.findByText(/ordering from/i)).toBeInTheDocument()
    // Branch stays in the URL (share/refresh/history safe).
    expect(window.location.pathname).toBe(`/r/deidos-grill/b/${DUBLIN_BRANCH_ID}/menu`)
  })

  it('soft-404s an unknown slug (never a 200 generic page)', async () => {
    renderAt('/r/does-not-exist')
    await screen.findByRole('heading', { name: /can't find that restaurant/i }, { timeout: 5000 })
  })

  it('shows a coming-soon state (no order CTAs)', async () => {
    renderAt('/r/sea-salt')
    await screen.findByRole('heading', { name: /coming soon/i }, { timeout: 5000 })
    expect(screen.queryByRole('button', { name: /order from here/i })).toBeNull()
  })

  it('shows a paused state with a browse-only affordance', async () => {
    renderAt('/r/the-dock')
    await screen.findByText(/isn't taking orders right now/i, {}, { timeout: 5000 })
    // Paused → browse, not order.
    expect(screen.queryByRole('button', { name: /order from here/i })).toBeNull()
    expect(await screen.findByRole('button', { name: /browse menu/i })).toBeInTheDocument()
  })

  it('redirects the legacy /menu path to the home page', async () => {
    renderAt('/menu')
    await screen.findByRole('heading', { name: /hungry\?/i }, { timeout: 5000 })
    expect(window.location.pathname).toBe('/')
  })
})
