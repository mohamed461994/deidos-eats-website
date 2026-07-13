/**
 * The one way a discounted online price is rendered — home strips, menu tiles,
 * and the item dialog all use this, so "was/now" can never drift between
 * surfaces. `baseCents` is ALWAYS the base price (`MenuItem.priceCents`) and
 * `promoCents` the active `onlinePromoPriceCents`; the charged price is the
 * server's business, this is display.
 *
 * The "now" price stays ink (money must always be readable — ember fails AA at
 * price sizes); the heat comes from the strike + the optional savings badge.
 */
import { Badge } from '@/components/ui/badge'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

interface PriceWasNowProps {
  baseCents: number
  promoCents: number
  /** Show a "Save €x" ember badge next to the pair (roomier surfaces only). */
  showSaving?: boolean
  className?: string
}

export function PriceWasNow({ baseCents, promoCents, showSaving = false, className }: PriceWasNowProps) {
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-1', className)}>
      <span className="sr-only">
        Was {formatCents(baseCents)}, now {formatCents(promoCents)}
      </span>
      <s aria-hidden className="tabular-nums text-[13px] text-muted">
        {formatCents(baseCents)}
      </s>
      <span aria-hidden className="tabular-nums font-[750]">
        {formatCents(promoCents)}
      </span>
      {showSaving && baseCents > promoCents && (
        <Badge variant="ember-soft" aria-hidden className="translate-y-[-1px]">
          Save {formatCents(baseCents - promoCents)}
        </Badge>
      )}
    </span>
  )
}
