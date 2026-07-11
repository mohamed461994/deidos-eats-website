import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react'

import { api } from '@/api'
import type { MenuItem, ModifierOption } from '@/api/types'

import {
  buildLine,
  cartItemCount,
  cartReducer,
  cartSubtotalCents,
  emptyCart,
  toCartLineInputs,
  type CartRestaurant,
  type CartState,
} from './cart'
import {
  migrateLegacyBranch,
  migrateLegacyCart,
  readCartV2,
  safeGet,
  safeRemove,
  V1_BRANCH_KEY,
  V1_CART_KEY,
  V2_CART_KEY,
  writeCartV2,
  type MigrationResolvers,
} from './storage'

interface AddResult {
  /** 'conflict' → cart holds another restaurant/branch's items; confirm to replace. */
  outcome: 'added' | 'conflict'
}

/**
 * Where the persisted basket is in the v1→v2 migration machine:
 * - `idle`: v2 in use (or nothing to migrate) — persistence is live.
 * - `migrating`: rolling a v1 cart forward; persistence is paused so we never
 *   clobber v1 or write an empty v2 mid-flight.
 * - `restore_pending`: migration failed (offline / deleted branch / storage) —
 *   v1 is preserved and the UI offers retry / start-fresh (plan §6.2.5).
 */
export type MigrationStatus = 'idle' | 'migrating' | 'restore_pending'

interface CartContextValue {
  cart: CartState
  itemCount: number
  subtotalCents: number
  lineInputs: ReturnType<typeof toCartLineInputs>
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
  addItem: (args: {
    restaurant: CartRestaurant
    branchId: string
    branchName: string
    item: MenuItem
    options: ModifierOption[]
    quantity: number
    force?: boolean
  }) => AddResult
  setQuantity: (key: string, quantity: number) => void
  removeLine: (key: string) => void
  clearCart: () => void
  migrationStatus: MigrationStatus
  retryRestore: () => void
  discardRestore: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

/** The real API wired into the migration resolvers (fakes are injected in tests). */
const resolvers: MigrationResolvers = {
  resolveBranch: (branchId) =>
    api.getBranch(branchId).then((b) => ({ restaurantId: b.restaurantId, branchName: b.name })),
  resolveRestaurant: (restaurantId) =>
    api.getRestaurant(restaurantId).then((r) => ({ id: r.id, name: r.name, slug: r.slug })),
}

/**
 * One synchronous read at startup: trust a valid v2, discard a malformed one,
 * and flag whether a legacy v1 cart/branch is present so the async machine runs.
 */
function loadInitialState(): { cart: CartState; needsMigration: boolean } {
  const v2 = readCartV2()
  if (v2.status === 'ok') return { cart: v2.cart, needsMigration: false }
  // A malformed/untrusted v2 is discarded so it can never resurface.
  if (v2.status === 'malformed') safeRemove(V2_CART_KEY)
  const legacyPresent = safeGet(V1_CART_KEY) !== null || safeGet(V1_BRANCH_KEY) !== null
  return { cart: emptyCart, needsMigration: legacyPresent }
}

export function CartProvider({ children }: { children: ReactNode }) {
  // One-time synchronous read of persisted state (lazy useState → runs once).
  const [initial] = useState(loadInitialState)

  const [cart, dispatch] = useReducer(cartReducer, initial.cart)
  const [isOpen, setIsOpen] = useState(false)
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus>(
    initial.needsMigration ? 'migrating' : 'idle',
  )
  // Bumping this re-triggers the migration effect (the "retry" action).
  const [migrationAttempt, setMigrationAttempt] = useState(0)

  // Async migration: only runs while status is 'migrating'. Idempotent — it
  // re-reads storage, and a success tombstones v1 so a re-run is a no-op.
  useEffect(() => {
    if (migrationStatus !== 'migrating') return
    let cancelled = false
    void (async () => {
      // Branch memory is best-effort and independent; kick it off, don't await it.
      void migrateLegacyBranch(resolvers)
      const result = await migrateLegacyCart(resolvers)
      if (cancelled) return
      if (result.status === 'migrated' || result.status === 'adopted') {
        dispatch({ type: 'load', cart: result.cart })
        setMigrationStatus('idle')
      } else if (result.status === 'nothing') {
        setMigrationStatus('idle')
      } else {
        // restore_pending — v1 preserved, cart stays empty, UI offers recovery.
        setMigrationStatus('restore_pending')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [migrationStatus, migrationAttempt])

  // Persist only when the machine is settled: never mid-migration (would clobber
  // v1) and never while restore is pending. writeCartV2 tombstones on empty, so
  // an empty v2 envelope is never written.
  useEffect(() => {
    if (migrationStatus !== 'idle') return
    writeCartV2(cart)
  }, [cart, migrationStatus])

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      itemCount: cartItemCount(cart),
      subtotalCents: cartSubtotalCents(cart),
      lineInputs: toCartLineInputs(cart),
      isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
      addItem: ({ restaurant, branchId, branchName, item, options, quantity, force = false }) => {
        const differentBranch =
          cart.branchId !== null && cart.branchId !== branchId && cart.lines.length > 0
        if (differentBranch && !force) return { outcome: 'conflict' }
        dispatch({
          type: 'add',
          restaurant,
          branchId,
          branchName,
          line: buildLine(item, options, quantity),
        })
        return { outcome: 'added' }
      },
      setQuantity: (key, quantity) => dispatch({ type: 'setQuantity', key, quantity }),
      removeLine: (key) => dispatch({ type: 'remove', key }),
      clearCart: () => dispatch({ type: 'clear' }),
      migrationStatus,
      retryRestore: () => {
        setMigrationStatus('migrating')
        setMigrationAttempt((n) => n + 1)
      },
      discardRestore: () => {
        // Give up on the legacy basket: tombstone v1 and return to a clean slate.
        safeRemove(V1_CART_KEY)
        safeRemove(V1_BRANCH_KEY)
        setMigrationStatus('idle')
      },
    }),
    [cart, isOpen, migrationStatus],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside <CartProvider>')
  return context
}
