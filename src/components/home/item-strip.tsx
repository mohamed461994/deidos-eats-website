/**
 * A merchandising strip — "From the oven" and "Discounted" share this one
 * anatomy: photo-led snap-scroll cards, each carrying its restaurant's name
 * (no anonymous flattening) and landing straight on that branch's menu. The
 * whole card is one link. An empty strip renders nothing — the section
 * collapses rather than showing placeholder junk.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { MarketplaceItem } from '@/api/types'
import { FoodImage } from '@/components/food-image'
import { PriceWasNow } from '@/components/price-was-now'
import { formatCents } from '@/lib/money'
import { formatKm } from '@/lib/distance'
import { paths } from '@/lib/routes'

// Stagger the first few cards' rise; beyond that they arrive together (a long
// tail of delays reads as lag, not craft).
const MAX_STAGGER_INDEX = 5
const STAGGER_STEP_MS = 40

function ItemCard({ item, index }: { item: MarketplaceItem; index: number }) {
  const promoActive = item.onlinePromoPriceCents != null
  return (
    <li
      className="rise-in w-[230px] shrink-0 snap-start sm:w-[256px]"
      style={{ animationDelay: `${Math.min(index, MAX_STAGGER_INDEX) * STAGGER_STEP_MS}ms` }}
    >
      <Link
        to={paths.restaurantMenu(item.restaurantSlug, item.branchId)}
        className="group block"
        aria-label={`${item.name} — ${item.restaurantName}, ${item.branchName}`}
      >
        <div className="overflow-hidden rounded-[16px]">
          <FoodImage
            src={item.imageUrl}
            alt=""
            fallbackLabel={item.name}
            className="aspect-[4/3] w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <h3 className="line-clamp-1 font-[650]">{item.name}</h3>
          {promoActive ? (
            <PriceWasNow
              baseCents={item.priceCents}
              promoCents={item.onlinePromoPriceCents!}
              className="shrink-0 justify-end"
            />
          ) : (
            <p className="tabular-nums shrink-0 text-muted">{formatCents(item.priceCents)}</p>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">
          {item.restaurantName} · {item.branchName}
          {item.distanceKm != null && (
            <span className="tabular-nums"> · {formatKm(item.distanceKm)}</span>
          )}
        </p>
      </Link>
    </li>
  )
}

interface ItemStripProps {
  /** Section heading id — ties the list to its heading for assistive tech. */
  headingId: string
  title: string
  subtitle?: string
  /** Rendered next to the title (e.g. the live ember dot on "From the oven"). */
  titleAccent?: ReactNode
  items: MarketplaceItem[]
}

export function ItemStrip({ headingId, title, subtitle, titleAccent, items }: ItemStripProps) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-baseline gap-2.5">
        <h2 id={headingId} className="display text-[clamp(1.5rem,3vw,2rem)]">
          {title}
        </h2>
        {titleAccent}
      </div>
      {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      <ul className="-mx-4 mt-5 flex snap-x gap-5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {items.map((item, index) => (
          <ItemCard key={`${item.branchId}-${item.itemId}`} item={item} index={index} />
        ))}
      </ul>
    </section>
  )
}
