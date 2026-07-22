/**
 * The query-persistence whitelist is a privacy boundary (nothing user-specific
 * — including the location-keyed home aggregate — may reach localStorage) and
 * the envelope guards bound staleness, so every discard branch and the
 * retention-coherence fix are pinned here. No live API required: clients are
 * seeded directly.
 */
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  persistPublicQueries,
  QUERY_CACHE_KEY,
  QUERY_CACHE_VERSION,
  restorePublicQueries,
  setupQueryPersistence,
} from './query-persistence'
import { PUBLIC_QUERY_CACHE_MS } from './queries'

const menu = { branchId: 'branch-1', categories: [{ id: 'cat-1', name: 'Pizzas', items: [] }] }
const restaurant = { id: 'rest-1', name: 'Púca Pizza', slug: 'puca-pizza' }

function seededClient(): QueryClient {
  const client = new QueryClient()
  client.setQueryData(['menu', 'branch-1'], menu)
  client.setQueryData(['restaurant', 'rest-1'], restaurant)
  return client
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('persist + restore round trip', () => {
  it('restores whitelisted public queries with their original dataUpdatedAt', () => {
    const source = seededClient()
    persistPublicQueries(source)

    const restored = new QueryClient()
    restorePublicQueries(restored)

    expect(restored.getQueryData(['menu', 'branch-1'])).toEqual(menu)
    expect(restored.getQueryData(['restaurant', 'rest-1'])).toEqual(restaurant)
    // Staleness math depends on the ORIGINAL fetch time surviving the round trip.
    expect(restored.getQueryState(['menu', 'branch-1'])!.dataUpdatedAt).toBe(
      source.getQueryState(['menu', 'branch-1'])!.dataUpdatedAt,
    )
  })

  it('never writes private, order, admin, or location-keyed queries to storage', () => {
    const client = seededClient()
    client.setQueryData(['me'], { email: 'buyer-pii@example.com' })
    client.setQueryData(['orders'], { items: [{ id: 'order-pii-1' }] })
    client.setQueryData(['order', 'order-pii-1'], { id: 'order-pii-1' })
    client.setQueryData(['addresses'], [{ line1: 'address-pii' }])
    client.setQueryData(['admin', 'staff'], [{ email: 'staff-pii@example.com' }])
    // The home aggregate is keyed by the buyer's coordinates — must stay off disk.
    client.setQueryData(['marketplace-home', 53.349, -6.26], { branches: ['loc-pii'] })
    persistPublicQueries(client)

    const raw = localStorage.getItem(QUERY_CACHE_KEY)!
    expect(raw).toContain('branch-1')
    for (const marker of ['buyer-pii', 'order-pii', 'address-pii', 'staff-pii', 'loc-pii', '53.349']) {
      expect(raw).not.toContain(marker)
    }

    const restored = new QueryClient()
    restorePublicQueries(restored)
    expect(restored.getQueryData(['me'])).toBeUndefined()
    expect(restored.getQueryData(['admin', 'staff'])).toBeUndefined()
    expect(restored.getQueryData(['marketplace-home', 53.349, -6.26])).toBeUndefined()
  })
})

describe('retention coherence (the eviction fix)', () => {
  it('control: a hydrated query with the default gcTime is evicted at 5 min', () => {
    // Pins the bug the fix addresses: without a long gcTime, an unobserved
    // restored query is GC'd and the next snapshot write would drop it.
    vi.useFakeTimers()
    const src = seededClient()
    const state = dehydrate(src, { shouldDehydrateQuery: () => true })
    const dst = new QueryClient()
    hydrate(dst, state)
    vi.advanceTimersByTime(5 * 60_000 + 1_000)
    expect(dst.getQueryData(['menu', 'branch-1'])).toBeUndefined()
  })

  it('restorePublicQueries keeps a restored query resident far past 5 min', () => {
    vi.useFakeTimers()
    persistPublicQueries(seededClient())
    const restored = new QueryClient()
    restorePublicQueries(restored)
    // 30 min, no observer: still present because restore sets a long gcTime.
    vi.advanceTimersByTime(30 * 60_000)
    expect(restored.getQueryData(['menu', 'branch-1'])).toEqual(menu)
    expect(PUBLIC_QUERY_CACHE_MS).toBeGreaterThan(30 * 60_000)
  })
})

describe('untrusted snapshot handling', () => {
  it('discards a snapshot from a different schema version', () => {
    persistPublicQueries(seededClient())
    const envelope = JSON.parse(localStorage.getItem(QUERY_CACHE_KEY)!) as { version: number }
    localStorage.setItem(
      QUERY_CACHE_KEY,
      JSON.stringify({ ...envelope, version: QUERY_CACHE_VERSION + 1 }),
    )

    const restored = new QueryClient()
    restorePublicQueries(restored)
    expect(restored.getQueryData(['menu', 'branch-1'])).toBeUndefined()
    expect(localStorage.getItem(QUERY_CACHE_KEY)).toBeNull()
  })

  it('discards an expired snapshot (older than the max age)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-21T10:00:00Z'))
    persistPublicQueries(seededClient())

    vi.setSystemTime(new Date('2026-07-23T10:00:01Z')) // > 24h later
    const restored = new QueryClient()
    restorePublicQueries(restored)
    expect(restored.getQueryData(['menu', 'branch-1'])).toBeUndefined()
    expect(localStorage.getItem(QUERY_CACHE_KEY)).toBeNull()
  })

  it('discards a future-dated snapshot (clock rollback)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-21T10:00:00Z'))
    persistPublicQueries(seededClient())

    vi.setSystemTime(new Date('2026-07-21T08:00:00Z'))
    const restored = new QueryClient()
    restorePublicQueries(restored)
    expect(restored.getQueryData(['menu', 'branch-1'])).toBeUndefined()
    expect(localStorage.getItem(QUERY_CACHE_KEY)).toBeNull()
  })

  it('tolerates malformed JSON without throwing and clears the key', () => {
    localStorage.setItem(QUERY_CACHE_KEY, '{not json')
    const restored = new QueryClient()
    expect(() => restorePublicQueries(restored)).not.toThrow()
    expect(localStorage.getItem(QUERY_CACHE_KEY)).toBeNull()
  })

  it('swallows storage write failures (quota/security)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => persistPublicQueries(seededClient())).not.toThrow()
  })
})

describe('setupQueryPersistence', () => {
  it('restores on setup, snapshots a persisted change after the delay, stops on cleanup', () => {
    persistPublicQueries(seededClient())

    vi.useFakeTimers()
    const client = new QueryClient()
    const stop = setupQueryPersistence(client)
    // Restore happened synchronously before any component could mount.
    expect(client.getQueryData(['menu', 'branch-1'])).toEqual(menu)

    client.setQueryData(['menu', 'branch-2'], { branchId: 'branch-2', categories: [] })
    vi.advanceTimersByTime(1_000)
    expect(localStorage.getItem(QUERY_CACHE_KEY)).toContain('branch-2')

    stop()
    client.setQueryData(['menu', 'branch-3'], { branchId: 'branch-3', categories: [] })
    vi.advanceTimersByTime(5_000)
    expect(localStorage.getItem(QUERY_CACHE_KEY)).not.toContain('branch-3')
  })

  it('ignores non-persisted queries — no wasted snapshot on me/orders churn', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const stop = setupQueryPersistence(client)
    const writes = vi.spyOn(Storage.prototype, 'setItem')

    client.setQueryData(['me'], { email: 'x@y.z' })
    client.setQueryData(['orders'], { items: [] })
    vi.advanceTimersByTime(5_000)
    expect(writes).not.toHaveBeenCalled()

    stop()
  })

  it('flushes synchronously on pagehide (freshest fetch not lost to the throttle)', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const stop = setupQueryPersistence(client)

    client.setQueryData(['menu', 'branch-9'], { branchId: 'branch-9', categories: [] })
    // Leave immediately, before the 1s throttle would fire.
    window.dispatchEvent(new Event('pagehide'))
    expect(localStorage.getItem(QUERY_CACHE_KEY)).toContain('branch-9')

    stop()
  })
})
