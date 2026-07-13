/**
 * The branch feed unit — the home page's core card. Branch-first, but never
 * anonymous: the restaurant's name (and logo when set) sits on every card, and
 * imagery joins in from the restaurants query (branch cover, falling back to
 * the restaurant hero). The whole card is ONE link straight to that branch's
 * menu; the menu page then remembers the branch for its restaurant.
 *
 * Availability is stated precisely: open (live dot) / closed / paused /
 * coming soon — a paused restaurant's branch never quietly reads as "closed
 * for the evening" when the truth is "not taking orders at all".
 */
import { Bike, Clock, MapPin, ShoppingBag } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router-dom'

import type { MarketplaceBranch, Restaurant } from '@/api/types'
import { FoodImage } from '@/components/food-image'
import { Badge } from '@/components/ui/badge'
import { formatKm } from '@/lib/distance'
import { STATUS_LABELS } from '@/lib/restaurant'
import { paths } from '@/lib/routes'
import { cn } from '@/lib/utils'

export interface BranchBrand {
  logoUrl: string | null
  /** Branch cover image (falls back to the restaurant hero). */
  imageUrl: string | null
  marketplaceStatus: Restaurant['marketplaceStatus']
}

interface BranchCardProps {
  branch: MarketplaceBranch
  /** Joined from GET /restaurants; undefined while that query is still loading. */
  brand?: BranchBrand
}

function AvailabilityLine({ branch, brand }: BranchCardProps) {
  if (brand?.marketplaceStatus === 'comingSoon') {
    return <Badge variant="crust">{STATUS_LABELS.comingSoon}</Badge>
  }
  if (brand?.marketplaceStatus === 'paused') {
    return <Badge variant="neutral">{STATUS_LABELS.paused}</Badge>
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-[650]',
        branch.isOpen ? 'text-basil' : 'text-muted',
      )}
    >
      {branch.isOpen ? <span aria-hidden className="ember-dot" /> : <Clock className="size-4" aria-hidden />}
      {branch.isOpen ? 'Open now' : 'Closed'}
    </span>
  )
}

/** Memoized: the feed re-renders on every location tick; unchanged cards skip. */
export const BranchCard = memo(function BranchCard({ branch, brand }: BranchCardProps) {
  const fulfillment = branch.fulfillment
  return (
    <Link
      to={paths.restaurantMenu(branch.restaurantSlug, branch.id)}
      className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-border bg-bg shadow-raised transition-shadow hover:shadow-floating"
    >
      <div className="relative overflow-hidden">
        <FoodImage
          src={brand?.imageUrl ?? null}
          alt=""
          fallbackLabel={branch.restaurantName}
          className="aspect-[16/9] w-full transition-transform duration-500 ease-(--ease-out) group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        {brand?.logoUrl && (
          <img
            src={brand.logoUrl}
            alt=""
            loading="lazy"
            className="absolute top-3 left-3 size-11 rounded-[10px] border border-border bg-bg object-cover shadow-raised"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-[13px] font-[650] text-basil">{branch.restaurantName}</p>
        <div className="flex items-start justify-between gap-3">
          <h3 className="display text-xl">{branch.name}</h3>
          <AvailabilityLine branch={branch} brand={brand} />
        </div>
        <p className="flex items-center gap-1.5 text-[15px] text-muted">
          <MapPin className="size-4 shrink-0 text-basil" aria-hidden />
          {branch.town ?? 'Ireland'}
          {branch.distanceKm != null && (
            <span className="tabular-nums">· {formatKm(branch.distanceKm)} away</span>
          )}
        </p>
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[15px]">
          {fulfillment.collectionEnabled && (
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="size-4 text-basil" aria-hidden />
              Collection
            </span>
          )}
          {fulfillment.deliveryEnabled && (
            <span className="flex items-center gap-1.5">
              <Bike className="size-4 text-basil" aria-hidden />
              Delivery
            </span>
          )}
        </div>
      </div>
    </Link>
  )
})
