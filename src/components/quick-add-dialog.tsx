/**
 * Quick-add from the home merchandising strips ("From the oven", "On offer").
 * Tapping a featured item opens THIS item's customise-and-add view in place —
 * the same body as the branch menu's item dialog — instead of dumping the
 * buyer on the full menu to hunt the item down again.
 *
 * The strip only carries a lightweight `MarketplaceItem` (no modifier groups,
 * no restaurant id), so this resolves the full `MenuItem` from the branch menu
 * and the owning restaurant from the restaurants list — both needed before the
 * shared {@link ItemDetail} can add to the (one-branch) cart. Until they land,
 * a single always-open Modal shows the item header with a loading options area;
 * a sold-out / missing / errored item falls back to the full menu.
 */
import { useNavigate } from 'react-router-dom'

import { useMenu, useRestaurants } from '@/api/queries'
import type { MarketplaceItem, Menu, MenuItem, Restaurant } from '@/api/types'
import type { CartRestaurant } from '@/cart/cart'
import { FoodImage } from '@/components/food-image'
import { ItemDetail } from '@/components/item-dialog'
import { PriceWasNow } from '@/components/price-was-now'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCents } from '@/lib/money'
import { paths } from '@/lib/routes'

type QuickAddState = 'loading' | 'ready' | 'soldout' | 'unavailable' | 'error'

/** The full menu item (with modifier groups) for a strip pick's item id. */
function findMenuItem(menu: Menu | undefined, itemId: string): MenuItem | null {
  for (const category of menu?.categories ?? []) {
    const found = category.items.find((i) => i.id === itemId)
    if (found) return found
  }
  return null
}

/** The cart restaurant that owns a branch — resolved to the authoritative id. */
function findRestaurant(
  restaurants: Restaurant[] | undefined,
  branchId: string,
): CartRestaurant | null {
  const owner = (restaurants ?? []).find((r) => r.branches.some((b) => b.id === branchId))
  return owner ? { id: owner.id, name: owner.name, slug: owner.slug } : null
}

interface QuickAddDialogProps {
  /** The strip item the buyer tapped, or null when the dialog is closed. */
  item: MarketplaceItem | null
  onClose: () => void
}

export function QuickAddDialog({ item, onClose }: QuickAddDialogProps) {
  const navigate = useNavigate()
  const menuQuery = useMenu(item?.branchId ?? null)
  const restaurantsQuery = useRestaurants()
  const menu = menuQuery.data
  const restaurants = restaurantsQuery.data?.items

  // The full menu item (modifier groups) and its owning restaurant — the strip
  // item carries only a slug, but the cart's authoritative link is the
  // restaurant id, so both are resolved by branch. (Plain derivations: the
  // React Compiler memoizes them; the source arrays are stable react-query data.)
  const menuItem = item ? findMenuItem(menu, item.itemId) : null
  const restaurant = item ? findRestaurant(restaurants, item.branchId) : null

  const state: QuickAddState =
    menuQuery.isError || restaurantsQuery.isError
      ? 'error'
      : !menu || !restaurants
        ? 'loading'
        : menuItem == null || restaurant == null
          ? 'unavailable'
          : !menuItem.isAvailable
            ? 'soldout'
            : 'ready'

  function goToMenu() {
    if (!item) return
    onClose()
    navigate(paths.restaurantMenu(item.restaurantSlug, item.branchId))
  }

  return (
    <Modal
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={item?.name ?? ''}
      hideTitle
      shape="center"
    >
      {item &&
        (state === 'ready' ? (
          <ItemDetail
            key={menuItem!.id}
            item={menuItem!}
            restaurant={restaurant!}
            branchId={item.branchId}
            branchName={item.branchName}
            onClose={onClose}
          />
        ) : (
          <QuickAddStatus
            item={item}
            state={state}
            onSeeMenu={goToMenu}
            onRetry={() => {
              void menuQuery.refetch()
              void restaurantsQuery.refetch()
            }}
          />
        ))}
    </Modal>
  )
}

/**
 * The non-ready states, sharing the item header so the Modal never flashes an
 * empty shell: the same photo/name/price the buyer tapped, then a loading,
 * sold-out, unavailable, or error area, and a "See full menu" escape.
 */
function QuickAddStatus({
  item,
  state,
  onSeeMenu,
  onRetry,
}: {
  item: MarketplaceItem
  state: Exclude<QuickAddState, 'ready'>
  onSeeMenu: () => void
  onRetry: () => void
}) {
  return (
    <>
      <div className="overflow-y-auto">
        <FoodImage
          src={item.imageUrl}
          alt={item.name}
          fallbackLabel={item.name}
          className="aspect-[16/9] w-full sm:rounded-t-[24px]"
        />
        <div className="flex flex-col gap-4 px-6 py-5">
          <div>
            <h2 className="display text-2xl">{item.name}</h2>
            <p className="mt-0.5 text-[15px] text-muted">
              {item.restaurantName} · {item.branchName}
            </p>
            {item.onlinePromoPriceCents != null ? (
              <PriceWasNow
                baseCents={item.priceCents}
                promoCents={item.onlinePromoPriceCents}
                showSaving
                className="mt-2 text-lg"
              />
            ) : (
              <p className="tabular-nums mt-2 text-lg font-[750]">{formatCents(item.priceCents)}</p>
            )}
          </div>

          {state === 'loading' ? (
            <div className="flex flex-col gap-3" aria-live="polite">
              <span className="sr-only">Loading options…</span>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-24 w-full rounded-[16px]" />
            </div>
          ) : state === 'soldout' ? (
            <p
              role="status"
              className="rounded-[16px] border border-border bg-surface px-4 py-3.5 text-[15px]"
            >
              This item is sold out right now — see the full menu for what’s available today.
            </p>
          ) : state === 'error' ? (
            <p
              role="alert"
              className="rounded-[16px] border border-error/40 bg-crust-tint px-4 py-3.5 text-[15px]"
            >
              Something went wrong loading this item. Try again, or open the full menu.
            </p>
          ) : (
            <p
              role="status"
              className="rounded-[16px] border border-border bg-surface px-4 py-3.5 text-[15px]"
            >
              We couldn’t load this item’s options — open the full menu to add it.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-bg px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          {state === 'error' && (
            <Button variant="outline" className="flex-1" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button className="flex-1" onClick={onSeeMenu}>
            See full menu
          </Button>
        </div>
      </div>
    </>
  )
}
