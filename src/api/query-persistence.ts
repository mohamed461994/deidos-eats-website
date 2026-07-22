/**
 * Cross-reload persistence for PUBLIC browse data — restaurant identity,
 * branches, and menus. A page load re-hydrates the last snapshot before first
 * render, so within a query's `staleTime` the app paints from cache and skips
 * the network entirely; older data still paints instantly and refetches in the
 * background (`dataUpdatedAt` survives the round-trip, so TanStack's normal
 * staleness rules — and the promo-boundary invalidation, which fires
 * immediately for any promo that ended while the snapshot slept — keep working
 * unchanged).
 *
 * Safety model (mirrors cart/storage.ts):
 * - WHITELIST, never blacklist: only `PUBLIC_QUERY_PREFIXES` (declared beside
 *   `queryKeys`) is written. `me`/`orders`/`addresses`, every `['admin', …]`
 *   query, AND the location-keyed `marketplace-home` aggregate stay
 *   memory-only, so no PII, coordinates, or staff data ever lands in
 *   localStorage and nothing leaks across accounts on a shared machine.
 * - Persisted data is UNTRUSTED display cache. Prices in it are estimates by
 *   design: the server reprices every cart from the database at
 *   validate/checkout, so a stale — or hand-edited — snapshot can never change
 *   what a buyer is charged.
 * - Versioned envelope + max age: anything unreadable, expired, or from another
 *   schema version is discarded wholesale, never "repaired".
 *
 * Retention coherence: restored queries are hydrated with
 * `gcTime = PUBLIC_QUERY_CACHE_MS` and the live hooks set the same `gcTime`, so
 * a persisted query is never evicted from memory before the on-disk snapshot
 * expires — otherwise the next snapshot write (which dehydrates the LIVE cache)
 * would drop it and lose the on-disk copy early.
 */
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query'

import { safeGet, safeRemove, safeSet } from '@/cart/storage'

import { PUBLIC_QUERY_CACHE_MS, PUBLIC_QUERY_PREFIXES } from './queries'

export const QUERY_CACHE_KEY = 'deidos-public-query-cache-v1'
/** Bump when a persisted payload shape changes incompatibly (contract bumps). */
export const QUERY_CACHE_VERSION = 1 as const
/** Snapshots older than this are dropped on load — bounds worst-case staleness. */
const MAX_AGE_MS = PUBLIC_QUERY_CACHE_MS
/** Cache events arrive in bursts (navigation refetches); one trailing write per burst. */
const WRITE_DELAY_MS = 1_000

interface QueryCacheEnvelope {
  version: typeof QUERY_CACHE_VERSION
  persistedAt: number
  state: DehydratedState
}

function isPersistedKey(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === 'string' && PUBLIC_QUERY_PREFIXES.has(queryKey[0])
}

/** Snapshot every successful whitelisted query. Best-effort: a quota/security
 * failure leaves the previous snapshot in place, and the max-age check bounds
 * how stale a leftover can get. */
export function persistPublicQueries(client: QueryClient): void {
  const state = dehydrate(client, {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && isPersistedKey(query.queryKey),
    // Mutations (checkout!) must never touch localStorage, paused or not.
    shouldDehydrateMutation: () => false,
  })
  const envelope: QueryCacheEnvelope = {
    version: QUERY_CACHE_VERSION,
    persistedAt: Date.now(),
    state,
  }
  safeSet(QUERY_CACHE_KEY, JSON.stringify(envelope))
}

/**
 * Hydrate the last snapshot into the client. Persisted data is untrusted: any
 * parse/shape/version/age problem discards the snapshot wholesale. `hydrate`
 * preserves each query's `dataUpdatedAt` (so staleness math is correct) and
 * skips any query the running client already holds fresher data for. The
 * `gcTime` default keeps restored-but-unobserved queries resident for the full
 * on-disk window instead of the 5-minute client default (see the retention note
 * above).
 */
export function restorePublicQueries(client: QueryClient): void {
  const raw = safeGet(QUERY_CACHE_KEY)
  if (raw === null) return
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    safeRemove(QUERY_CACHE_KEY)
    return
  }
  const envelope = (parsed ?? {}) as Partial<QueryCacheEnvelope>
  const age = typeof envelope.persistedAt === 'number' ? Date.now() - envelope.persistedAt : NaN
  if (
    envelope.version !== QUERY_CACHE_VERSION ||
    !(age >= 0 && age <= MAX_AGE_MS) || // NaN and future-dated (clock rollback) both fail here
    envelope.state == null ||
    typeof envelope.state !== 'object'
  ) {
    safeRemove(QUERY_CACHE_KEY)
    return
  }
  try {
    hydrate(client, envelope.state, {
      defaultOptions: { queries: { gcTime: PUBLIC_QUERY_CACHE_MS } },
    })
  } catch {
    safeRemove(QUERY_CACHE_KEY)
  }
}

/**
 * Restore the last snapshot, then keep it current. Two triggers, both cheap:
 * a trailing-throttled write when a WHITELISTED query's data changes (observer
 * churn and non-persisted queries — `me`/orders/admin — are ignored, so no
 * wasted serialization), and a synchronous flush on `pagehide`/tab-hide so the
 * freshest fetch is captured even if the user leaves within the throttle
 * window. Returns a stop function for tests; the app runs for the tab's
 * lifetime. The caller gates this to live mode — the vitest/mock harness must
 * stay isolated per test and never rehydrate another run's cache.
 */
export function setupQueryPersistence(client: QueryClient): () => void {
  restorePublicQueries(client)

  let timer: ReturnType<typeof setTimeout> | null = null
  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    // Only a data change on a persisted query is worth re-snapshotting; skip
    // observer add/remove/results churn and every non-whitelisted query.
    if (event.type !== 'added' && event.type !== 'updated') return
    if (!isPersistedKey(event.query.queryKey)) return
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      persistPublicQueries(client)
    }, WRITE_DELAY_MS)
  })

  const flush = () => {
    clearTimer()
    persistPublicQueries(client)
  }
  // `pagehide` is the reliable "leaving" signal (fires on tab close, nav, and
  // bfcache) where `beforeunload`/`unload` are not; `visibilitychange` covers
  // the mobile case where the tab is backgrounded and later killed.
  const onHide = () => {
    if (document.visibilityState === 'hidden') persistPublicQueries(client)
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onHide)

  return () => {
    unsubscribe()
    clearTimer()
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onHide)
  }
}
