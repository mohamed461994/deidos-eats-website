import { useCallback, useSyncExternalStore } from 'react'

import type { BranchSummary } from '@/api/types'

/** The customer's chosen branch, remembered across visits. */
const STORAGE_KEY = 'puca-branch-v1'

const listeners = new Set<() => void>()

// localStorage is the single source of truth: `getSnapshot` reads it fresh each
// render (returns the same string value when unchanged, so it stays Object.is
// stable and doesn't loop). Keeping no separate cached copy avoids the store
// drifting out of sync with storage — the source of a subtle stale-selection bug.
//
// The in-memory fallback exists ONLY for browsers where storage access *throws*
// (e.g. "block all cookies"): without it, tapping a branch there would change
// nothing and the chooser gate could never be dismissed. While storage works,
// reads always hit storage, so the fallback can't leak stale state (or break
// tests that clear localStorage between cases).
let memoryFallback: string | null = null

function readBranch(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return memoryFallback
  }
}

function setBranch(branchId: string) {
  memoryFallback = branchId
  try {
    localStorage.setItem(STORAGE_KEY, branchId)
  } catch {
    // Storage unavailable (private mode, quota, blocked): the in-memory value
    // keeps the selection for this session; it just won't survive a reload.
  }
  listeners.forEach((l) => l())
}

export function useSelectedBranch(): [string | null, (branchId: string) => void] {
  const branchId = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    readBranch,
  )
  const select = useCallback((id: string) => setBranch(id), [])
  return [branchId, select]
}

/**
 * Resolve which branch is *effectively* selected, without ever silently
 * defaulting to the first of several branches (the bug this whole feature
 * fixes — a Cork customer must never be handed the Dublin menu by accident):
 *
 * - a stored id that still exists in the branch list wins;
 * - otherwise, a single-branch restaurant auto-selects its only branch (zero
 *   friction — there is nothing to choose);
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
