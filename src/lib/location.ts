/**
 * The buyer's home-page location — the "near you" anchor for `/`.
 *
 * Two ways to have one (both optional, neither ever gates browsing):
 * - `coords`: browser geolocation, rounded to ~3 decimals (~110 m) BEFORE it is
 *   stored or sent anywhere, so a precise doorstep fix never leaves the device.
 * - `town`: a manual pick from the towns that actually have branches; it anchors
 *   to that town's branch coordinates (already public data).
 *
 * localStorage is the source of truth (same `useSyncExternalStore` pattern as
 * `branch-selection.ts`); an in-memory fallback covers browsers where storage
 * access throws. The snapshot caches the parsed object per raw string so it
 * stays reference-stable and never loops the store.
 */
import { useCallback, useSyncExternalStore } from 'react'

import { safeRemove, safeSet } from '@/cart/storage'

export const HOME_LOCATION_KEY = 'deidos-home-location-v1'

export type HomeLocation =
  | { kind: 'coords'; latitude: number; longitude: number }
  | { kind: 'town'; town: string; latitude: number; longitude: number }

/** ~3 decimals ≈ 110 m — enough to sort kitchens, too coarse to identify a doorstep. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000
}

function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
  )
}

function parseStored(raw: string): HomeLocation | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return null
    const value = parsed as Record<string, unknown>
    if (!isValidCoordinate(value.latitude, value.longitude)) return null
    const latitude = roundCoordinate(value.latitude as number)
    const longitude = roundCoordinate(value.longitude as number)
    if (value.kind === 'coords') return { kind: 'coords', latitude, longitude }
    if (value.kind === 'town' && typeof value.town === 'string' && value.town.trim() !== '') {
      return { kind: 'town', town: value.town, latitude, longitude }
    }
    return null
  } catch {
    return null
  }
}

let memoryFallback: string | null = null
// Cache keyed by raw string so getSnapshot returns a stable reference.
let cachedRaw: string | null = null
let cachedLocation: HomeLocation | null = null

const listeners = new Set<() => void>()

function readRaw(): string | null {
  try {
    return localStorage.getItem(HOME_LOCATION_KEY)
  } catch {
    return memoryFallback
  }
}

function readLocation(): HomeLocation | null {
  const raw = readRaw()
  if (raw === cachedRaw) return cachedLocation
  cachedRaw = raw
  cachedLocation = raw === null ? null : parseStored(raw)
  return cachedLocation
}

// Best-effort persistence (cart/storage's never-throw wrappers); the in-memory
// fallback set first keeps this session's pick when storage is blocked.
function write(raw: string | null) {
  memoryFallback = raw
  if (raw === null) safeRemove(HOME_LOCATION_KEY)
  else safeSet(HOME_LOCATION_KEY, raw)
  listeners.forEach((listener) => listener())
}

export function setHomeLocation(location: HomeLocation) {
  // Defensive re-round: no caller can accidentally persist precise coordinates.
  write(
    JSON.stringify({
      ...location,
      latitude: roundCoordinate(location.latitude),
      longitude: roundCoordinate(location.longitude),
    }),
  )
}

export function clearHomeLocation() {
  write(null)
}

/** The stored location (or null), live across tabs of this app and components. */
export function useHomeLocation(): HomeLocation | null {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return useSyncExternalStore(subscribe, readLocation)
}

export interface TownOption {
  town: string
  latitude: number
  longitude: number
}

/** Anything with a town + coordinates — the home feed's branches qualify. */
interface TownSource {
  town?: string | null
  latitude?: number | null
  longitude?: number | null
}

/**
 * The towns a buyer can pick from — derived from live branch data (the home
 * feed carries every published branch with its town + coordinates, and is
 * never radius-filtered), never a hardcoded list. Branches without coordinates
 * are skipped: without an anchor they cannot sort anything. Deduped
 * case-insensitively, alphabetical.
 */
export function townOptions(branches: readonly TownSource[] | undefined): TownOption[] {
  if (!branches) return []
  const byTown = new Map<string, TownOption>()
  for (const branch of branches) {
    const town = branch.town?.trim()
    if (!town || branch.latitude == null || branch.longitude == null) continue
    const key = town.toLowerCase()
    if (!byTown.has(key)) {
      byTown.set(key, {
        town,
        latitude: roundCoordinate(branch.latitude),
        longitude: roundCoordinate(branch.longitude),
      })
    }
  }
  return [...byTown.values()].sort((a, b) => a.town.localeCompare(b.town))
}
