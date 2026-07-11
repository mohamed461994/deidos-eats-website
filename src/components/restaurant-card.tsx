import { ArrowRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { Restaurant } from '@/api/types'
import { FoodImage } from '@/components/food-image'
import { Badge } from '@/components/ui/badge'
import { availabilityOf, branchTowns, type AvailabilityTone } from '@/lib/restaurant'
import { paths } from '@/lib/routes'
import { cn } from '@/lib/utils'

/** Which badge treatment each availability tone gets (open/partial carry the live ember). */
const TONE_BADGE: Record<AvailabilityTone, { variant: 'basil-soft' | 'crust' | 'neutral'; live: boolean }> = {
  open: { variant: 'basil-soft', live: true },
  partial: { variant: 'basil-soft', live: true },
  closed: { variant: 'neutral', live: false },
  comingSoon: { variant: 'crust', live: false },
  paused: { variant: 'neutral', live: false },
  none: { variant: 'neutral', live: false },
}

/**
 * A restaurant on the marketplace, presented as a considered preview of its own
 * home — a full-bleed food hero, its name and tagline, and a precise availability
 * badge — not a flattened listing row. The WHOLE card is one link (no nested
 * interactive elements); hover lifts the tile and settles the photo.
 */
export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const availability = availabilityOf(restaurant)
  const badge = TONE_BADGE[availability.tone]
  const towns = branchTowns(restaurant)
  const townLine = towns.length > 0 ? towns.join(' · ') : null

  return (
    <Link
      to={paths.restaurant(restaurant.slug)}
      aria-label={`${restaurant.name}. ${availability.label}.${townLine ? ` Locations in ${townLine}.` : ''}`}
      className="group flex flex-col overflow-hidden rounded-[24px] border border-border bg-bg shadow-raised transition-shadow duration-200 hover:shadow-floating focus-visible:shadow-floating"
    >
      <div className="relative overflow-hidden">
        <FoodImage
          src={restaurant.heroImageUrl ?? null}
          alt={restaurant.heroImageAlt ?? ''}
          fallbackLabel={restaurant.name}
          className="aspect-[16/10] w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <div className="absolute top-4 left-4">
          <Badge variant={badge.variant} className="shadow-raised">
            {badge.live && <span aria-hidden className="ember-dot" />}
            {availability.label}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-6">
        <h3 className="display text-2xl">{restaurant.name}</h3>
        {restaurant.tagline && (
          <p className="line-clamp-2 text-[15px] text-muted">{restaurant.tagline}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          {townLine ? (
            <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-[550] text-muted">
              <MapPin className="size-3.5 shrink-0 text-basil" aria-hidden />
              <span className="truncate">Locations in {townLine}</span>
            </p>
          ) : (
            <span />
          )}
          <span
            className={cn(
              'flex shrink-0 items-center gap-1.5 text-[15px] font-[650] transition-colors',
              availability.canOrderNow ? 'text-basil' : 'text-muted',
            )}
          >
            {availability.canOrderNow ? 'View menu' : 'Take a look'}
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              aria-hidden
            />
          </span>
        </div>
      </div>
    </Link>
  )
}
