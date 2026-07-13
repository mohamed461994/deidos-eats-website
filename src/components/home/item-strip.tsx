/**
 * A merchandising strip — "From the oven" and "Discounted" share this one
 * anatomy: photo-led snap-scroll cards, each carrying its restaurant's name
 * (no anonymous flattening). Tapping a card opens THAT item's customise-and-add
 * dialog in place (via `onSelect`) — the same view as the branch menu — rather
 * than navigating to the full menu. An empty strip renders nothing: the section
 * collapses rather than showing placeholder junk.
 */
import type { ReactNode } from 'react'

import type { MarketplaceItem } from '@/api/types'
import { FoodImage } from '@/components/food-image'
import { PriceWasNow } from '@/components/price-was-now'
import { formatCents } from '@/lib/money'
import { formatKm } from '@/lib/distance'
import { staggerDelayMs } from '@/lib/utils'

function ItemCard({
  item,
  index,
  onSelect,
}: {
  item: MarketplaceItem
  index: number
  onSelect: (item: MarketplaceItem) => void
}) {
  const promoActive = item.onlinePromoPriceCents != null
  return (
    <li
      className="rise-in w-[230px] shrink-0 snap-start sm:w-[256px]"
      style={{ animationDelay: staggerDelayMs(index) }}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="group block w-full text-left"
        aria-label={`${item.name} — ${item.restaurantName}, ${item.branchName}. Add to basket`}
      >
        <div className="overflow-hidden rounded-[16px]">
          <FoodImage
            src={item.imageUrl}
            alt=""
            fallbackLabel={item.name}
            className="aspect-[4/3] w-full transition-transform duration-500 ease-(--ease-out) group-hover:scale-[1.04] motion-reduce:transition-none"
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
      </button>
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
  /** Opens the tapped item's customise-and-add dialog. */
  onSelect: (item: MarketplaceItem) => void
}

export function ItemStrip({
  headingId,
  title,
  subtitle,
  titleAccent,
  items,
  onSelect,
}: ItemStripProps) {
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
          <ItemCard
            key={`${item.branchId}-${item.itemId}`}
            item={item}
            index={index}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </section>
  )
}
