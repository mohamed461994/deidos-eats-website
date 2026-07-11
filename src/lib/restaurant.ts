/**
 * Shared restaurant availability logic. The badges must be PRECISE — never a
 * group-level "open" that hides a closed branch (plan §6.2.2). One helper so the
 * card, discovery, and restaurant home all say the same true thing.
 */
import type { Restaurant } from '@/api/types'

export type AvailabilityTone = 'open' | 'partial' | 'closed' | 'comingSoon' | 'paused' | 'none'

export interface Availability {
  /** Precise, human-facing label — e.g. "1 of 2 locations open". */
  label: string
  tone: AvailabilityTone
  /** True only when at least one branch is open AND the restaurant accepts orders. */
  canOrderNow: boolean
}

export function openBranchCount(restaurant: Pick<Restaurant, 'branches'>): number {
  return restaurant.branches.filter((b) => b.isOpen).length
}

export function availabilityOf(restaurant: Restaurant): Availability {
  if (restaurant.marketplaceStatus === 'comingSoon')
    return { label: 'Coming soon', tone: 'comingSoon', canOrderNow: false }
  if (restaurant.marketplaceStatus === 'paused')
    return { label: 'Not taking orders', tone: 'paused', canOrderNow: false }

  const total = restaurant.branches.length
  if (total === 0) return { label: 'No locations yet', tone: 'none', canOrderNow: false }

  const open = openBranchCount(restaurant)
  if (open === 0) return { label: 'Closed right now', tone: 'closed', canOrderNow: false }
  if (open === total) {
    return {
      label: total === 1 ? 'Open now' : `All ${total} locations open`,
      tone: 'open',
      canOrderNow: true,
    }
  }
  return { label: `${open} of ${total} locations open`, tone: 'partial', canOrderNow: true }
}

/** Distinct branch towns, e.g. for a "Locations in Dublin · Cork" line. */
export function branchTowns(restaurant: Restaurant): string[] {
  const towns = restaurant.branches.map((b) => b.town).filter((t): t is string => !!t)
  return [...new Set(towns)]
}
