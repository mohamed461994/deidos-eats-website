import { useCallback, useSyncExternalStore } from 'react'

/** The customer's chosen branch, remembered across visits. */
const STORAGE_KEY = 'puca-branch-v1'

let current: string | null = localStorage.getItem(STORAGE_KEY)
const listeners = new Set<() => void>()

function setBranch(branchId: string) {
  current = branchId
  localStorage.setItem(STORAGE_KEY, branchId)
  listeners.forEach((l) => l())
}

export function useSelectedBranch(): [string | null, (branchId: string) => void] {
  const branchId = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
  const select = useCallback((id: string) => setBranch(id), [])
  return [branchId, select]
}
