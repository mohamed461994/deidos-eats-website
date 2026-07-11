import { useCallback, useSyncExternalStore } from 'react'

import type { BranchSummary } from '@/api/types'
import { V2_BRANCH_MEMORY_KEY, writeBranchMemory, type BranchMemory } from '@/cart/storage'

/**
 * The customer's chosen branch, remembered PER RESTAURANT (plan §6.2.6):
 * `{ [restaurantId]: branchId }`. A marketplace visitor picks a different branch
 * for each restaurant, so a single global "selected branch" (the old
 * `puca-branch-v1`) would hand restaurant B the branch they last chose at
 * restaurant A. localStorage is the source of truth; `getSnapshot` reads a
 * PRIMITIVE (the branch id for this restaurant, or null) so it stays Object.is
 * stable and never loops.
 *
 * The in-memory fallback exists ONLY for browsers where storage access *throws*
 * (e.g. "block all cookies"); while storage works, reads always hit storage, so
 * the fallback can't leak stale state across sessions or break tests.
 */
let memoryFallback: BranchMemory | null = null

const listeners = new Set<() => void>()

function readMemory(): BranchMemory {
  try {
    const raw = localStorage.getItem(V2_BRANCH_MEMORY_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: BranchMemory = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return memoryFallback ?? {}
  }
}

function readBranchFor(restaurantId: string | null): string | null {
  if (!restaurantId) return null
  return readMemory()[restaurantId] ?? null
}

function rememberBranch(restaurantId: string, branchId: string) {
  const next: BranchMemory = { ...readMemory(), [restaurantId]: branchId }
  memoryFallback = next
  writeBranchMemory(next) // best-effort; the fallback keeps this session's pick
  listeners.forEach((l) => l())
}

/**
 * A restaurant's remembered branch, with a setter. The setter is a no-op key —
 * passing a null restaurantId (restaurant not resolved yet) reads/writes nothing.
 */
export function useRememberedBranch(
  restaurantId: string | null,
): [string | null, (branchId: string) => void] {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, [])
  const getSnapshot = useCallback(() => readBranchFor(restaurantId), [restaurantId])
  const branchId = useSyncExternalStore(subscribe, getSnapshot)
  const select = useCallback(
    (id: string) => {
      if (restaurantId) rememberBranch(restaurantId, id)
    },
    [restaurantId],
  )
  return [branchId, select]
}

/**
 * Resolve which branch is *effectively* selected, without ever silently
 * defaulting to the first of several branches (the bug this feature fixes — a
 * Cork customer must never be handed the Dublin menu by accident):
 *
 * - a stored id that still exists in the branch list wins;
 * - otherwise, a single-branch restaurant auto-selects its only branch (zero
 *   friction — there is nothing to choose), but the UI still shows a "Change"
 *   affordance;
 * - otherwise `null`, which tells the UI to show the branch chooser gate.
 *
 * A stale stored id (branch removed/renamed) resolves to `null` so the gate
 * reappears rather than pointing at a branch that no longer exists.
 */
export function resolveSelectedBranch(
  branches: BranchSummary[] | undefined,
  selectedId: string | null,
): string | null {
  if (!branches || branches.length === 0) return null
  if (selectedId && branches.some((b) => b.id === selectedId)) return selectedId
  if (branches.length === 1) return branches[0].id
  return null
}
