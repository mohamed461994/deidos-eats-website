/**
 * Promo-boundary behavior: a "was/now" price disappears the moment its promo
 * expires — on the menu (query invalidated at the boundary) and on the home
 * discounted strip — and a tab that slept through the boundary catches up on
 * visibilitychange. Fake timers drive the clock exactly like the mock's
 * half-open promo windows expect.
 */
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { DUBLIN_BRANCH_ID, resetMarketplaceForTests } from '@/api/mock/data'
import { queryClient } from '@/api/query-client'
import { usePromoBoundaryRefresh } from '@/lib/use-promo-refresh'

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

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  queryClient.clear()
  // Promo fixtures anchor to the (faked) clock: the Dublin house special ends
  // in 2 h, the Galway caesar promo has no scheduled end.
  resetMarketplaceForTests()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('menu was/now at the promo boundary', () => {
  it('renders was/now while active, then reprices to base when the promo ends', async () => {
    renderAt(`/r/deidos-grill/b/${DUBLIN_BRANCH_ID}/menu`)
    // Restaurant-by-slug resolves first, then the branch menu (350 ms each).
    await advance(1200)

    const tile = screen
      .getByRole('button', { name: /the house special, now €11\.50, was €14\.50/i })
    expect(tile).toBeInTheDocument()

    // Cross the boundary: the hook invalidates, the refetch reprices at base.
    await advance(TWO_HOURS_MS + 5000)
    const repriced = screen.getByRole('button', { name: /the house special, €14\.50/i })
    expect(repriced).toBeInTheDocument()
    // No strike/promo remnant on the tile ("€11.50" elsewhere is The Classic's base price).
    expect(repriced.textContent).not.toContain('€11.50')
  })
})

describe('home discounted strip at the promo boundary', () => {
  it('drops expired promos and keeps open-ended ones', async () => {
    renderAt('/')
    await advance(1200)

    const heading = screen.getByRole('heading', { name: /on offer/i })
    const strip = heading.closest('section')!
    expect(strip).toHaveTextContent('The House Special')
    expect(strip).toHaveTextContent('Grilled Chicken Caesar')

    await advance(TWO_HOURS_MS + 5000)
    const refreshed = screen.getByRole('heading', { name: /on offer/i }).closest('section')!
    // The 2 h promos expired; the unscheduled Galway promo survives.
    expect(refreshed).not.toHaveTextContent('The House Special')
    expect(refreshed).toHaveTextContent('Grilled Chicken Caesar')
  })
})

describe('usePromoBoundaryRefresh', () => {
  it('fires once when the timer crosses the boundary — no invalidation loop', async () => {
    const onBoundary = vi.fn()
    const endsAt = new Date(Date.now() + 1000).toISOString()
    renderHook(() => usePromoBoundaryRefresh([endsAt], onBoundary))

    await advance(2000)
    expect(onBoundary).toHaveBeenCalledTimes(1)
    // The boundary set is unchanged (as if the refetch returned identical
    // data): re-checks must not fire again for the same passed boundary.
    await advance(60_000)
    expect(onBoundary).toHaveBeenCalledTimes(1)
  })

  it('catches a boundary that passed while the tab slept, on visibilitychange', () => {
    const onBoundary = vi.fn()
    const endsAt = new Date(Date.now() + 10 * 60_000).toISOString()
    renderHook(() => usePromoBoundaryRefresh([endsAt], onBoundary))

    // A sleeping tab: the wall clock jumps but no timer ever fired.
    vi.setSystemTime(Date.now() + 11 * 60_000)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(onBoundary).toHaveBeenCalledTimes(1)

    // Waking again past the same boundary must not re-fire.
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(onBoundary).toHaveBeenCalledTimes(1)
  })

  it('arms nothing when no promo has a scheduled end', async () => {
    const onBoundary = vi.fn()
    renderHook(() => usePromoBoundaryRefresh([null, undefined], onBoundary))
    await advance(TWO_HOURS_MS)
    expect(onBoundary).not.toHaveBeenCalled()
  })
})
