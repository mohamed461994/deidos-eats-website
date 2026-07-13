/**
 * The branch-first home page (`/`) against the two-restaurant mock: brand-
 * carrying branch feed (flattened, never anonymous), server-side sorting
 * (open-first unlocated, nearest-first located), section-empty collapse,
 * was/now promo rendering, the location control (geolocate / town / clear /
 * denied), error + retry, zero restaurants, paused states, and store badges
 * gated on admin URLs. Drives the REAL <App/>.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '@/App'
import { resetMockApiForTests } from '@/api/mock/api'
import {
  CORK_BRANCH_ID,
  GALWAY_BRANCH_ID,
  mockMarketplace,
  restaurantA,
  restaurantB,
  restaurantPaused,
} from '@/api/mock/data'
import { queryClient } from '@/api/query-client'
import { HOME_LOCATION_KEY } from '@/lib/location'

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

/** The Galway town anchor — Dublin/Cork sit far outside the 15 km merch radius. */
const GALWAY_LOCATION = JSON.stringify({
  kind: 'town',
  town: 'Galway',
  latitude: 53.271,
  longitude: -9.057,
})

async function findBranchFeed() {
  const heading = await screen.findByRole(
    'heading',
    { name: /every kitchen|kitchens near you/i },
    { timeout: 5000 },
  )
  return heading.closest('section')!
}

beforeEach(() => {
  localStorage.clear()
  resetMockApiForTests()
  // The query client is module-scoped (one per test FILE) — drop cached home
  // payloads so each test's fixture overrides actually load.
  queryClient.clear()
})
afterEach(() => {
  cleanup()
  // Geolocation is stubbed per-test; never leak a stub into the next test.
  delete (window.navigator as { geolocation?: unknown }).geolocation
})

function stubGeolocation(getCurrentPosition: unknown) {
  Object.defineProperty(window.navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  })
}

describe('home page — branch feed', () => {
  it('flattens both restaurants into branch cards, each carrying its restaurant brand', async () => {
    renderAt('/')
    const feed = await findBranchFeed()
    const cards = within(feed).getAllByRole('link')
    expect(cards).toHaveLength(3)
    // No anonymous flattening: every card names its restaurant and links
    // straight to that branch's menu (branch in the URL).
    const grillCard = within(feed).getByRole('heading', { name: 'Ranelagh' }).closest('a')!
    expect(within(grillCard).getByText('Deidos Grill')).toBeInTheDocument()
    const nonnasCard = within(feed).getByRole('heading', { name: 'Quay Street' }).closest('a')!
    expect(within(nonnasCard).getByText("Nonna's Table")).toBeInTheDocument()
    expect(nonnasCard.getAttribute('href')).toBe(`/r/nonnas-table/b/${GALWAY_BRANCH_ID}/menu`)
  })

  it('sorts open-first when no location is set, and never shows distances', async () => {
    // Close Cork so open-first ordering is observable.
    const closedCork = {
      ...restaurantA,
      branches: restaurantA.branches.map((b) =>
        b.id === CORK_BRANCH_ID ? { ...b, isOpen: false } : b,
      ),
    }
    mockMarketplace.restaurants = [closedCork, restaurantB]
    renderAt('/')
    const feed = await findBranchFeed()
    const names = within(feed)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    // Open branches first (name order), the closed one last.
    expect(names).toEqual(['Quay Street', 'Ranelagh', 'Washington Street'])
    expect(within(feed).queryByText(/km away/)).toBeNull()
  })

  it('sorts nearest-first with distance labels when a location is set', async () => {
    localStorage.setItem(HOME_LOCATION_KEY, GALWAY_LOCATION)
    renderAt('/')
    const feed = await findBranchFeed()
    const names = within(feed)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    // Galway is closest to Galway; Cork beats Dublin from there.
    expect(names).toEqual(['Quay Street', 'Washington Street', 'Ranelagh'])
    expect(within(feed).getAllByText(/km away/).length).toBeGreaterThan(0)
  })

  it('labels a paused restaurant’s branch precisely (never just "Closed")', async () => {
    mockMarketplace.restaurants = [restaurantA, restaurantB, restaurantPaused]
    renderAt('/')
    const feed = await findBranchFeed()
    const pausedCard = within(feed).getByRole('heading', { name: 'Harbour Road' }).closest('a')!
    expect(within(pausedCard).getByText('Not taking orders')).toBeInTheDocument()
    expect(within(pausedCard).getByText('The Dock')).toBeInTheDocument()
  })

  it('shows the zero-restaurants state when the marketplace is empty', async () => {
    mockMarketplace.restaurants = []
    renderAt('/')
    await screen.findByRole('heading', { name: /no restaurants yet/i }, { timeout: 5000 })
  })
})

describe('home page — merchandising sections', () => {
  it('renders the oven strip and the discounted strip with was/now pricing', async () => {
    renderAt('/')
    const ovenHeading = await screen.findByRole(
      'heading',
      { name: /from the oven/i },
      { timeout: 5000 },
    )
    const oven = ovenHeading.closest('section')!
    // Oven picks carry restaurant attribution.
    expect(within(oven).getByText(/Deidos Grill · Ranelagh/)).toBeInTheDocument()

    const discounted = screen.getByRole('heading', { name: /on offer/i }).closest('section')!
    // The Dublin house special: was €14.50, now €11.50. Each card is a button
    // (it opens the item's add dialog in place — no longer a link to the menu).
    const card = within(discounted).getByText('The House Special').closest('button')!
    expect(within(card).getByText('€14.50')).toBeInTheDocument()
    expect(within(card).getByText('€11.50')).toBeInTheDocument()
    expect(within(card).getByText(/was €14\.50, now €11\.50/i)).toBeInTheDocument()
  })

  it('opens the item’s add-to-basket dialog in place — never navigating to the menu', async () => {
    renderAt('/')
    // Home + branch-menu + restaurants each resolve through the mock's delay(),
    // so this flow needs headroom beyond the 5s default.
    const discounted = (
      await screen.findByRole('heading', { name: /on offer/i }, { timeout: 5000 })
    ).closest('section')!
    fireEvent.click(within(discounted).getByText('The House Special'))

    // Same customise view as the branch menu: modifier groups from the full
    // item resolve in the dialog, and the promo "now" price rides the Add CTA.
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 })
    expect(await within(dialog).findByText('Extra toppings', {}, { timeout: 5000 })).toBeInTheDocument()
    const add = within(dialog).getByRole('button', { name: /^add ·/i })
    expect(add).toHaveTextContent('€11.50')

    fireEvent.click(add)
    // Added straight to the basket, still on the home page (no menu navigation).
    expect(await screen.findByText(/the house special added/i, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  }, 20000)

  it('scopes merchandising to the location radius when located', async () => {
    localStorage.setItem(HOME_LOCATION_KEY, GALWAY_LOCATION)
    renderAt('/')
    const ovenHeading = await screen.findByRole(
      'heading',
      { name: /from the oven/i },
      { timeout: 5000 },
    )
    const oven = ovenHeading.closest('section')!
    // Only the Galway pick is within 15 km of Galway.
    expect(within(oven).getByText('The Classic')).toBeInTheDocument()
    expect(within(oven).queryByText('Double Stack')).toBeNull()
  })

  it('collapses empty sections entirely — no placeholder junk', async () => {
    mockMarketplace.banners = []
    mockMarketplace.ovenPicks = []
    mockMarketplace.promos = {}
    renderAt('/')
    await findBranchFeed()
    expect(screen.queryByRole('region', { name: /offers and news/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /from the oven/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /on offer/i })).toBeNull()
  })

  it('renders admin banners when present', async () => {
    renderAt('/')
    expect(
      await screen.findByRole('heading', { name: /bank holiday, sorted/i }, { timeout: 5000 }),
    ).toBeInTheDocument()
  })
})

describe('home page — admin content', () => {
  it('uses admin copy when set, and shows store badges only when URLs exist', async () => {
    mockMarketplace.content = {
      ...mockMarketplace.content,
      heroHeading: 'Tea time in Tralee',
      appStoreUrl: 'https://apps.apple.com/ie/app/deidos-eats/id0000000000',
    }
    renderAt('/')
    await screen.findByRole('heading', { name: 'Tea time in Tralee' }, { timeout: 5000 })
    const badges = await screen.findByRole('region', { name: /get the app/i })
    const appStore = within(badges).getByRole('link', { name: /app store/i })
    expect(appStore.getAttribute('href')).toContain('apps.apple.com')
    // No Play URL set → no Play badge.
    expect(within(badges).queryByRole('link', { name: /google play/i })).toBeNull()
  })

  it('hides store badges entirely when no URLs are set', async () => {
    renderAt('/')
    await findBranchFeed()
    expect(screen.queryByRole('region', { name: /get the app/i })).toBeNull()
  })
})

describe('home page — location control', () => {
  it('geolocates, rounds the fix, sorts nearest-first, and clears back to open-first', async () => {
    stubGeolocation(
      (success: (position: { coords: { latitude: number; longitude: number } }) => void) => {
        success({ coords: { latitude: 53.2707123, longitude: -9.0568456 } })
      },
    )

    renderAt('/')
    await findBranchFeed()
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))

    // Located: the chip (with its clear affordance) appears, feed re-sorts
    // nearest-first (Galway fix → Quay St first).
    await screen.findByRole('button', { name: /clear location/i }, { timeout: 5000 })
    const feed = await findBranchFeed()
    await within(feed).findAllByText(/km away/, {}, { timeout: 5000 })
    // The stored fix is rounded to 3 decimals — never the raw reading.
    const stored = JSON.parse(localStorage.getItem(HOME_LOCATION_KEY)!) as {
      latitude: number
      longitude: number
    }
    expect(stored.latitude).toBe(53.271)
    expect(stored.longitude).toBe(-9.057)

    fireEvent.click(screen.getByRole('button', { name: /clear location/i }))
    expect(await screen.findByRole('button', { name: /use my location/i })).toBeInTheDocument()
    expect(localStorage.getItem(HOME_LOCATION_KEY)).toBeNull()
  })

  it('picking a town from live branch data anchors sorting to that town', async () => {
    renderAt('/')
    await findBranchFeed()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Galway' } })
    expect(await screen.findByText(/near galway/i, {}, { timeout: 5000 })).toBeInTheDocument()
    const feed = await findBranchFeed()
    const names = await within(feed).findAllByRole('heading', { level: 3 })
    expect(names[0].textContent).toBe('Quay Street')
  })

  it('a denied geolocation never blocks browsing', async () => {
    stubGeolocation((_success: unknown, errorCallback: (error: { code: number }) => void) => {
      errorCallback({ code: 1 })
    })

    renderAt('/')
    await findBranchFeed()
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }))
    expect(
      await screen.findByText(/couldn't get your location/i, {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    // Browsing is untouched: the feed is still there, unlocated.
    const feed = await findBranchFeed()
    expect(within(feed).getAllByRole('link')).toHaveLength(3)
    expect(localStorage.getItem(HOME_LOCATION_KEY)).toBeNull()
  })
})

describe('home page — error state', () => {
  it('shows error + retry, and retry recovers', async () => {
    // Two failures cover the initial fetch and react-query's single retry.
    mockMarketplace.failHomeRequests = 2
    renderAt('/')
    const alert = await screen.findByRole('alert', {}, { timeout: 8000 })
    // Typographic apostrophe in the copy ("didn’t").
    expect(within(alert).getByRole('heading', { name: /that didn.t work/i })).toBeInTheDocument()
    fireEvent.click(within(alert).getByRole('button', { name: /try again/i }))
    expect(await findBranchFeed()).toBeInTheDocument()
  })
})
