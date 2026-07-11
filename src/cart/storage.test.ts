/**
 * The v1→v2 cart storage migration is money-critical (a bug wipes or mis-attributes
 * a launch-day basket), so every branch of the state machine — including the
 * §6.2.5 failure modes — is pinned here against the pure functions and the
 * injected-resolver orchestrator. No live API required.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CartLine, CartState } from './cart'
import {
  migrateLegacyBranch,
  migrateLegacyCart,
  readBranchMemory,
  readCartV2,
  writeCartV2,
  V1_BRANCH_KEY,
  V1_CART_KEY,
  V2_BRANCH_MEMORY_KEY,
  V2_CART_KEY,
  type MigrationResolvers,
} from './storage'

const line: CartLine = {
  key: 'item-1|',
  menuItemId: 'item-1',
  name: 'The House Special',
  imageUrl: null,
  unitPriceCents: 1450,
  quantity: 2,
  modifiers: [],
}

const cartA: CartState = {
  restaurantId: 'rest-A',
  restaurantName: 'Deidos Grill',
  restaurantSlug: 'deidos-grill',
  branchId: 'branch-1',
  branchName: 'Ranelagh',
  lines: [line],
}

/** Resolvers that succeed — authoritative identity comes from HERE, not storage. */
const okResolvers: MigrationResolvers = {
  resolveBranch: async () => ({ restaurantId: 'rest-A', branchName: 'Ranelagh' }),
  resolveRestaurant: async () => ({ id: 'rest-A', name: 'Deidos Grill', slug: 'deidos-grill' }),
}

function seedLegacyCart(overrides?: Record<string, unknown>) {
  localStorage.setItem(
    V1_CART_KEY,
    JSON.stringify({ branchId: 'branch-1', branchName: 'Ranelagh', lines: [line], ...overrides }),
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readCartV2', () => {
  it('is absent with no stored cart', () => {
    expect(readCartV2()).toEqual({ status: 'absent' })
  })

  it('is malformed on unparseable JSON', () => {
    localStorage.setItem(V2_CART_KEY, '{not json')
    expect(readCartV2().status).toBe('malformed')
  })

  it('is malformed on an unknown version', () => {
    localStorage.setItem(V2_CART_KEY, JSON.stringify({ version: 99, ...cartA }))
    expect(readCartV2().status).toBe('malformed')
  })

  it('is empty when a valid envelope has no lines', () => {
    localStorage.setItem(V2_CART_KEY, JSON.stringify({ version: 2, ...cartA, lines: [] }))
    expect(readCartV2().status).toBe('empty')
  })

  it('reads back a written cart', () => {
    writeCartV2(cartA)
    const result = readCartV2()
    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.cart).toMatchObject({
      restaurantId: 'rest-A',
      branchId: 'branch-1',
    })
  })

  it('degrades to absent when storage access throws (blocked cookies)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(readCartV2()).toEqual({ status: 'absent' })
  })
})

describe('writeCartV2 — never persists an empty v2', () => {
  it('tombstones the key for an empty cart instead of writing { lines: [] }', () => {
    writeCartV2(cartA)
    expect(localStorage.getItem(V2_CART_KEY)).not.toBeNull()
    writeCartV2({ ...cartA, lines: [] })
    expect(localStorage.getItem(V2_CART_KEY)).toBeNull()
  })

  it('writes a version-stamped envelope for a non-empty cart', () => {
    writeCartV2(cartA)
    const raw = JSON.parse(localStorage.getItem(V2_CART_KEY)!)
    expect(raw.version).toBe(2)
    expect(raw.lines).toHaveLength(1)
  })
})

describe('migrateLegacyCart', () => {
  it('migrates v1 → v2, deriving identity from the branch, then tombstones v1', async () => {
    seedLegacyCart()
    const result = await migrateLegacyCart(okResolvers)
    expect(result.status).toBe('migrated')
    expect(result.status === 'migrated' && result.cart.restaurantId).toBe('rest-A')
    // v2 written…
    expect(readCartV2().status).toBe('ok')
    // …and only THEN v1 tombstoned (order matters for crash-safety).
    expect(localStorage.getItem(V1_CART_KEY)).toBeNull()
  })

  it('does nothing (and tombstones) when there is no usable v1 cart', async () => {
    const result = await migrateLegacyCart(okResolvers)
    expect(result.status).toBe('nothing')
  })

  it('treats a malformed v1 cart as nothing and tombstones it', async () => {
    localStorage.setItem(V1_CART_KEY, '{broken')
    const result = await migrateLegacyCart(okResolvers)
    expect(result.status).toBe('nothing')
    expect(localStorage.getItem(V1_CART_KEY)).toBeNull()
  })

  it('never migrates an empty legacy cart', async () => {
    seedLegacyCart({ lines: [] })
    const result = await migrateLegacyCart(okResolvers)
    expect(result.status).toBe('nothing')
    expect(readCartV2().status).toBe('absent')
  })

  it('goes restore_pending and PRESERVES v1 when the branch is gone (404)', async () => {
    seedLegacyCart()
    const result = await migrateLegacyCart({
      ...okResolvers,
      resolveBranch: async () => {
        throw new Error('404 not found')
      },
    })
    expect(result.status).toBe('restore_pending')
    expect(localStorage.getItem(V1_CART_KEY)).not.toBeNull() // recoverable
    expect(readCartV2().status).toBe('absent') // no half-written v2
  })

  it('goes restore_pending and preserves v1 when the restaurant is unpublished (404)', async () => {
    seedLegacyCart()
    const result = await migrateLegacyCart({
      ...okResolvers,
      resolveRestaurant: async () => {
        throw new Error('404 not found')
      },
    })
    expect(result.status).toBe('restore_pending')
    expect(localStorage.getItem(V1_CART_KEY)).not.toBeNull()
  })

  it('goes restore_pending and preserves v1 when storage rejects the write (quota/security)', async () => {
    seedLegacyCart()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const result = await migrateLegacyCart(okResolvers)
    expect(result.status).toBe('restore_pending')
    // v1 raw is still readable (the spy only blocks setItem).
    expect(localStorage.getItem(V1_CART_KEY)).not.toBeNull()
  })

  it('recovers on a retry after a transient failure (interrupted migration)', async () => {
    seedLegacyCart()
    const failing = await migrateLegacyCart({
      ...okResolvers,
      resolveRestaurant: async () => {
        throw new Error('offline')
      },
    })
    expect(failing.status).toBe('restore_pending')
    // Retry once the resolvers work: v1 is intact, so migration completes.
    const retry = await migrateLegacyCart(okResolvers)
    expect(retry.status).toBe('migrated')
    expect(localStorage.getItem(V1_CART_KEY)).toBeNull()
  })

  it('adopts an existing v2 written by another tab and aborts its own write', async () => {
    seedLegacyCart()
    // Another tab migrated first while we were resolving.
    const otherTabCart: CartState = { ...cartA, restaurantName: 'Other Tab Grill' }
    writeCartV2(otherTabCart)
    const result = await migrateLegacyCart(okResolvers)
    expect(result.status).toBe('adopted')
    expect(result.status === 'adopted' && result.cart.restaurantName).toBe('Other Tab Grill')
    // Our write did not clobber the other tab's basket; v1 is cleared.
    expect(readCartV2().status === 'ok').toBe(true)
    expect(localStorage.getItem(V1_CART_KEY)).toBeNull()
  })
})

describe('migrateLegacyBranch — resolve-or-drop', () => {
  it('moves a bare legacy branch into per-restaurant memory, then drops the key', async () => {
    localStorage.setItem(V1_BRANCH_KEY, 'branch-1')
    await migrateLegacyBranch(okResolvers)
    expect(readBranchMemory()).toEqual({ 'rest-A': 'branch-1' })
    expect(localStorage.getItem(V1_BRANCH_KEY)).toBeNull()
  })

  it('drops the legacy branch key (no escalation) when the branch cannot resolve', async () => {
    localStorage.setItem(V1_BRANCH_KEY, 'gone')
    await migrateLegacyBranch({
      ...okResolvers,
      resolveBranch: async () => {
        throw new Error('404')
      },
    })
    expect(readBranchMemory()).toEqual({})
    expect(localStorage.getItem(V1_BRANCH_KEY)).toBeNull()
    expect(localStorage.getItem(V2_BRANCH_MEMORY_KEY)).toBeNull()
  })
})
