/**
 * Apple Maps deep link for a branch location. Prefers precise coordinates when
 * the branch has them, and falls back to a text query of the street + town.
 * Extracted from `locations.tsx` so the locations, checkout, and order-tracking
 * pages all build the same link the same way.
 */

/** The subset of a branch address needed to build a maps link. */
export interface MappableAddress {
  line1: string
  town: string
  latitude?: number | null
  longitude?: number | null
}

export function mapsUrlFor(name: string, address: MappableAddress): string {
  if (address.latitude != null && address.longitude != null) {
    return `https://maps.apple.com/?ll=${address.latitude},${address.longitude}&q=${encodeURIComponent(name)}`
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(`${address.line1}, ${address.town}`)}`
}
