/**
 * The home page's location control — a sorting aid, never a gate. Lives inside
 * the basil-deep hero, so every surface here is paper-on-deep (DESIGN.md's
 * drench direction). Two ways in: browser geolocation (rounded to ~3 decimals
 * before it is stored or sent — see `lib/location.ts`) or a town pick built
 * from live branch data. Cleared in one tap; browsing never depends on it.
 */
import { LocateFixed, MapPin, X } from 'lucide-react'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import {
  clearHomeLocation,
  roundCoordinate,
  setHomeLocation,
  type HomeLocation,
  type TownOption,
} from '@/lib/location'
import { useGeolocate } from '@/lib/use-geolocate'

interface LocationControlProps {
  location: HomeLocation | null
  towns: TownOption[]
}

export function LocationControl({ location, towns }: LocationControlProps) {
  const { locate, cancel, locating, geoNote, clearGeoNote } = useGeolocate()
  const selectId = useId()

  function requestLocation() {
    locate({
      onFix: (coords) => {
        // Rounded BEFORE leaving this callback: the precise fix is never kept.
        setHomeLocation({
          kind: 'coords',
          latitude: roundCoordinate(coords.latitude),
          longitude: roundCoordinate(coords.longitude),
        })
      },
      unavailableMessage: "Location isn't available on this device — pick a town, or just browse.",
      failedMessage: "We couldn't get your location — pick a town, or just browse.",
    })
  }

  function pickTown(townName: string) {
    const town = towns.find((t) => t.town === townName)
    if (!town) return
    // An explicit town pick wins over any still-pending geolocation fix.
    cancel()
    clearGeoNote()
    setHomeLocation({
      kind: 'town',
      town: town.town,
      latitude: town.latitude,
      longitude: town.longitude,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {location ? (
          // min-h matches the 44px "Use my location" button this pill replaces,
          // so locating never shifts the hero. The clear button's hit area is
          // padded out (negative margins keep the pill visually unchanged).
          <p className="flex min-h-11 items-center gap-2 rounded-full bg-paper/12 px-4 py-2 text-[15px] font-[550] text-paper">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {location.kind === 'town' ? `Near ${location.town}` : 'Near you'}
            {/* The feed's own subtitle explains the sort on small screens —
                repeating it here would wrap the pill to two cramped lines. */}
            <span className="hidden font-[400] text-paper-muted sm:inline">
              · closest kitchens first
            </span>
            <button
              type="button"
              onClick={() => clearHomeLocation()}
              aria-label="Clear location"
              className="-my-2 -mr-2 rounded-full p-2 transition-colors hover:bg-paper/15"
            >
              <X className="size-4" aria-hidden />
            </button>
          </p>
        ) : (
          <>
            <Button variant="paper" loading={locating} onClick={requestLocation}>
              <LocateFixed className="size-4" aria-hidden />
              Use my location
            </Button>
            {towns.length > 0 && (
              <>
                <label htmlFor={selectId} className="text-[15px] text-paper-muted">
                  or pick a town
                </label>
                <select
                  id={selectId}
                  value=""
                  onChange={(e) => pickTown(e.target.value)}
                  className="h-11 rounded-full border border-paper/30 bg-transparent px-4 text-[15px] font-[550] text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
                >
                  <option value="" disabled className="text-ink">
                    Towns…
                  </option>
                  {towns.map((town) => (
                    <option key={town.town} value={town.town} className="text-ink">
                      {town.town}
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        )}
      </div>
      {geoNote && (
        <p role="status" className="text-[13px] text-paper-muted">
          {geoNote}
        </p>
      )}
    </div>
  )
}
