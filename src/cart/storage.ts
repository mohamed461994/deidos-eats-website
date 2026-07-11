/**
 * Cart + branch persistence and the v1→v2 migration state machine (plan §6.2.5).
 *
 * The marketplace pivot changes what a persisted cart means: v1 was a single
 * chain's `{ branchId, branchName, lines }`; v2 additionally pins the restaurant
 * so a global route can name it and a stale entry can be re-validated. Rolling a
 * user forward is money-critical — a launch-day bug here is a wiped or
 * wrong-restaurant basket — so the transition is an explicit machine with hard
 * invariants, not a hopeful `JSON.parse`:
 *
 *   1. Read a VALIDATED v2 first; if present, use it.
 *   2. Else, preserve v1 UNTOUCHED, resolve the old branch → restaurant via the
 *      API, write ONE versioned v2 envelope, and only THEN tombstone v1.
 *   3. Any failure (offline, deleted branch 404, unpublished restaurant 404,
 *      storage throw) leaves v1 intact and surfaces a recoverable
 *      "basket restore pending" state. Never persist an empty v2 cart.
 *   4. Persisted restaurant name/slug are UNTRUSTED display cache — identity is
 *      re-derived from the authoritative branch; consumers block checkout on any
 *      inconsistency.
 *
 * Everything here is pure or takes injected async resolvers, so every branch —
 * including the failure modes — is unit-testable without a live API.
 */
import type { CartRestaurant, CartState } from './cart'

/** Legacy single-chain keys — read as the migration SOURCE, tombstoned after. */
export const V1_CART_KEY = 'puca-cart-v1'
export const V1_BRANCH_KEY = 'puca-branch-v1'
/** Marketplace keys. */
export const V2_CART_KEY = 'deidos-cart-v2'
export const V2_BRANCH_MEMORY_KEY = 'deidos-branch-memory-v2'

const CART_VERSION = 2 as const

/** The one shape written to `deidos-cart-v2`. Invariant: `lines` is never empty. */
export interface CartEnvelopeV2 extends CartState {
  version: typeof CART_VERSION
}

/* ---- storage helpers that never throw -------------------------------------
 * localStorage access throws under "block all cookies" (SecurityError) and at
 * quota (QuotaExceededError). Every access is guarded so a hostile storage
 * environment degrades to in-memory, never a crash mid-render or mid-migration.
 */
export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore — nothing we can do; caller treats persistence as best-effort
  }
}

/* ---- validation (persisted data is untrusted) ----------------------------- */

function isCartLineArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  return value.every(
    (l) =>
      l != null &&
      typeof l === 'object' &&
      typeof (l as { key?: unknown }).key === 'string' &&
      typeof (l as { menuItemId?: unknown }).menuItemId === 'string' &&
      typeof (l as { quantity?: unknown }).quantity === 'number' &&
      Array.isArray((l as { modifiers?: unknown }).modifiers),
  )
}

/** A structurally valid, NON-EMPTY cart with restaurant + branch identity. */
function isValidCart(value: unknown): value is CartState {
  if (value == null || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return (
    typeof c.restaurantId === 'string' &&
    typeof c.branchId === 'string' &&
    isCartLineArray(c.lines) &&
    (c.lines as unknown[]).length > 0
  )
}

export type CartReadResult =
  | { status: 'ok'; cart: CartState }
  | { status: 'empty' } // valid envelope but no lines — treat as no cart
  | { status: 'malformed' } // unparseable or wrong version/shape — discard
  | { status: 'absent' }

/** Read + validate the v2 envelope. Pure; the single trusted entry to v2. */
export function readCartV2(): CartReadResult {
  const raw = safeGet(V2_CART_KEY)
  if (raw === null) return { status: 'absent' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'malformed' }
  }
  if (parsed == null || typeof parsed !== 'object') return { status: 'malformed' }
  if ((parsed as { version?: unknown }).version !== CART_VERSION) return { status: 'malformed' }
  const lines = (parsed as { lines?: unknown }).lines
  if (Array.isArray(lines) && lines.length === 0) return { status: 'empty' }
  if (!isValidCart(parsed)) return { status: 'malformed' }
  const p = parsed as CartEnvelopeV2
  return {
    status: 'ok',
    cart: {
      restaurantId: p.restaurantId,
      restaurantName: p.restaurantName,
      restaurantSlug: p.restaurantSlug,
      branchId: p.branchId,
      branchName: p.branchName,
      lines: p.lines,
    },
  }
}

/**
 * Persist the cart. Enforces the "never write an empty v2" invariant: an empty
 * cart tombstones the key instead of writing `{ lines: [] }`. Returns false when
 * storage rejected the write (quota/security) so the caller can surface it.
 */
export function writeCartV2(cart: CartState): boolean {
  if (cart.lines.length === 0 || !cart.restaurantId || !cart.branchId) {
    safeRemove(V2_CART_KEY)
    return true
  }
  const envelope: CartEnvelopeV2 = { version: CART_VERSION, ...cart }
  return safeSet(V2_CART_KEY, JSON.stringify(envelope))
}

/** A parsed legacy cart, or a signal that v1 is unusable/absent. */
type LegacyCartRead =
  | { status: 'ok'; branchId: string; branchName: string | null; lines: CartState['lines'] }
  | { status: 'unusable' } // malformed or empty — nothing to restore

export function readLegacyCartV1(): LegacyCartRead {
  const raw = safeGet(V1_CART_KEY)
  if (raw === null) return { status: 'unusable' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'unusable' }
  }
  if (parsed == null || typeof parsed !== 'object') return { status: 'unusable' }
  const c = parsed as Record<string, unknown>
  if (typeof c.branchId !== 'string' || !isCartLineArray(c.lines) || (c.lines as unknown[]).length === 0)
    return { status: 'unusable' }
  return {
    status: 'ok',
    branchId: c.branchId,
    branchName: typeof c.branchName === 'string' ? c.branchName : null,
    lines: c.lines as CartState['lines'],
  }
}

/* ---- migration orchestrator ----------------------------------------------- */

export interface MigrationResolvers {
  /** getBranch → the branch's owning restaurant id (authoritative identity). */
  resolveBranch: (branchId: string) => Promise<{ restaurantId: string; branchName: string }>
  /** getRestaurant → published restaurant identity; throws (404) if unpublished/gone. */
  resolveRestaurant: (restaurantId: string) => Promise<CartRestaurant>
}

export type MigrationResult =
  | { status: 'migrated'; cart: CartState } // wrote v2, tombstoned v1
  | { status: 'adopted'; cart: CartState } // another tab already wrote v2; abort
  | { status: 'nothing' } // no usable v1 — tombstoned, empty cart
  | { status: 'restore_pending' } // failure — v1 preserved, recoverable

/**
 * Roll a v1 cart forward to v2. Called only when {@link readCartV2} was not `ok`.
 * Order is load-bearing: resolve → re-read v2 (multi-tab) → write v2 → tombstone
 * v1. A crash or throw at any step leaves v1 recoverable (never a half-written v2,
 * never a lost basket).
 */
export async function migrateLegacyCart(
  resolvers: MigrationResolvers,
): Promise<MigrationResult> {
  const legacy = readLegacyCartV1()
  if (legacy.status === 'unusable') {
    // Nothing worth keeping — clear the tombstone so we don't retry every load.
    safeRemove(V1_CART_KEY)
    return { status: 'nothing' }
  }

  try {
    // Identity comes from the AUTHORITATIVE branch, never from stale storage.
    const branch = await resolvers.resolveBranch(legacy.branchId)
    const restaurant = await resolvers.resolveRestaurant(branch.restaurantId)

    const cart: CartState = {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      branchId: legacy.branchId,
      branchName: legacy.branchName ?? branch.branchName,
      lines: legacy.lines,
    }

    // Multi-tab: another tab may have already migrated while we were resolving.
    // Re-read immediately before writing; if a valid v2 exists now, adopt it and
    // abort our write (idempotent — don't clobber the other tab's basket).
    const current = readCartV2()
    if (current.status === 'ok') {
      safeRemove(V1_CART_KEY)
      return { status: 'adopted', cart: current.cart }
    }

    if (!writeCartV2(cart)) {
      // Storage rejected the write (quota/security) — v1 stays, recoverable.
      return { status: 'restore_pending' }
    }
    // v2 committed; only now is it safe to drop v1.
    safeRemove(V1_CART_KEY)
    return { status: 'migrated', cart }
  } catch {
    // Offline / deleted branch (404) / unpublished restaurant (404): v1 UNTOUCHED.
    return { status: 'restore_pending' }
  }
}

/* ---- branch memory: { [restaurantId]: branchId } (plan §6.2.6) ------------- */

export type BranchMemory = Record<string, string>

export function readBranchMemory(): BranchMemory {
  const raw = safeGet(V2_BRANCH_MEMORY_KEY)
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: BranchMemory = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function writeBranchMemory(memory: BranchMemory): void {
  safeSet(V2_BRANCH_MEMORY_KEY, JSON.stringify(memory))
}

/**
 * Best-effort migration of the legacy bare-branch key into per-restaurant memory.
 * Lower stakes than the cart (worst case the branch gate reappears once), so this
 * is resolve-or-drop: on ANY failure the legacy key is simply dropped, never
 * escalated to a recoverable state.
 */
export async function migrateLegacyBranch(
  resolvers: Pick<MigrationResolvers, 'resolveBranch'>,
): Promise<void> {
  const branchId = safeGet(V1_BRANCH_KEY)
  if (branchId === null) return
  try {
    const branch = await resolvers.resolveBranch(branchId)
    const memory = readBranchMemory()
    if (!memory[branch.restaurantId]) {
      memory[branch.restaurantId] = branchId
      writeBranchMemory(memory)
    }
  } catch {
    // resolve-or-drop — fall through to the tombstone below
  }
  safeRemove(V1_BRANCH_KEY)
}
