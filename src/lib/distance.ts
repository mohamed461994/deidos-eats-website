/**
 * Location helpers shared by the branch picker and checkout guardrails:
 * straight-line distance (to sort branches by "how close am I") and county
 * comparison (to warn when a delivery address is in a different county than the
 * ordering branch). The distance formula mirrors the API's authoritative
 * great-circle calc (`deidos-eats-api/src/modules/cart/delivery-fee.ts`) so the
 * numbers we show line up with what the server ultimately charges.
 */

export interface LatLng {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_KM = 6371

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Great-circle distance between two coordinates, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLng = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * Human distance label: "< 1 km" up close, one decimal below 10 km ("2.1 km"),
 * whole km beyond ("219 km"). The near band matters because town-pick
 * locations reuse branch coordinates, so a buyer's own town otherwise reads as
 * a bogus-looking "0 km away".
 */
export function formatKm(km: number): string {
  if (km < 1) return '< 1 km'
  const rounded = km < 10 ? Math.round(km * 10) / 10 : Math.round(km)
  return `${rounded} km`
}

/**
 * Normalize an Irish county for comparison: trim, case-fold, and strip a leading
 * "Co."/"Co"/"County" prefix so "Co. Cork" and "cork" compare equal. Returns ''
 * for missing values so callers can treat unknown counties as "don't warn".
 */
export function normalizeCounty(county: string | null | undefined): string {
  if (!county) return ''
  return county
    .trim()
    .toLowerCase()
    .replace(/^co(?:unty|\.)?\s+/, '')
    .trim()
}

/** True only when both counties are known and normalize to the same value. */
export function sameCounty(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCounty(a)
  const nb = normalizeCounty(b)
  return na !== '' && na === nb
}
