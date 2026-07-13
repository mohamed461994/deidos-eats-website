import { MapPin } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import type { MenuItem } from '@/api/types'
import { errorMessage } from '@/api'
import { queryKeys, useMenu } from '@/api/queries'
import { BranchPickerDialog } from '@/components/branch-picker'
import { FoodImage } from '@/components/food-image'
import { ItemDialog } from '@/components/item-dialog'
import { PriceWasNow } from '@/components/price-was-now'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCart } from '@/cart/context'
import { useRememberedBranch } from '@/lib/branch-selection'
import { formatCents } from '@/lib/money'
import { paths } from '@/lib/routes'
import { usePromoBoundaryRefresh } from '@/lib/use-promo-refresh'
import { cn } from '@/lib/utils'

import { useRestaurantRoute } from './restaurant-layout'

function categoryAnchor(categoryId: string) {
  return `category-${categoryId}`
}

export function MenuPage() {
  const restaurant = useRestaurantRoute()
  const { branchId } = useParams<{ branchId: string }>()
  const navigate = useNavigate()
  const [, rememberBranch] = useRememberedBranch(restaurant.id)
  const { cart } = useCart()

  // Branch comes from the URL (plan §6.2.1) and must belong to THIS restaurant —
  // a stale/foreign id resolves to a recoverable "location unavailable" state,
  // never a silent wrong-branch menu.
  const branch = restaurant.branches.find((b) => b.id === branchId)
  const menuQuery = useMenu(branch ? branch.id : null)
  const menu = menuQuery.data

  const [pickerOpen, setPickerOpen] = useState(false)
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const sectionsRef = useRef<Map<string, HTMLElement>>(new Map())
  const queryClient = useQueryClient()

  // Refetch this menu (and the home strips) the moment a visible promo ends —
  // a "was/now" price never outlives its promo, even after a sleeping tab.
  const promoBoundaries = useMemo(
    () => (menu?.categories ?? []).flatMap((c) => c.items.map((i) => i.promoEndsAt)),
    [menu],
  )
  const menuBranchId = branch?.id ?? null
  usePromoBoundaryRefresh(promoBoundaries, () => {
    if (menuBranchId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.menu(menuBranchId) })
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.marketplaceHomeAll })
  })

  // Remember this branch for the restaurant so returning to `/r/:slug` preselects it.
  useEffect(() => {
    if (branch) rememberBranch(branch.id)
  }, [branch, rememberBranch])

  // Scrollspy: highlight the category currently in view.
  useEffect(() => {
    if (!menu) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveCategory(visible[0].target.id)
      },
      { rootMargin: '-120px 0px -60% 0px' },
    )
    sectionsRef.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [menu])

  // A coming-soon restaurant has no live menu — send them to its home state.
  if (restaurant.marketplaceStatus === 'comingSoon') {
    return <Navigate to={paths.restaurant(restaurant.slug)} replace />
  }

  // Deleted / foreign branch id: recover, don't guess a menu.
  if (!branch) {
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 sm:px-6">
        <EmptyState
          title="That location isn't available"
          body={`We couldn't find that ${restaurant.name} branch — it may have closed or the link is out of date. Pick a location to see its menu.`}
          action={
            <Button onClick={() => navigate(paths.restaurant(restaurant.slug))}>
              See {restaurant.name} locations
            </Button>
          }
        />
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-6">
        <p className="text-sm font-[650] text-muted">{restaurant.name}</p>
        <h1 className="display mt-1 text-[clamp(2rem,4.5vw,3.25rem)]">The menu</h1>

        {restaurant.marketplaceStatus === 'paused' && (
          <p
            role="status"
            className="mt-4 rounded-[16px] border border-warning/40 bg-crust-tint px-4 py-3.5 text-[15px]"
          >
            {restaurant.name} isn't taking orders right now — browse away, ordering reopens soon.
          </p>
        )}

        {/* Branch context — always visible, always one tap from changing. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-[15px]">
            <MapPin className="size-4 shrink-0 text-basil" aria-hidden />
            Ordering from <strong className="font-[650]">{branch.name}</strong>
            <span className={cn('font-[550]', branch.isOpen ? 'text-basil' : 'text-muted')}>
              · {branch.isOpen ? 'Open now' : 'Closed'}
            </span>
          </p>
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            Change branch
          </Button>
        </div>

        {!branch.isOpen && (
          <p role="status" className="mt-3 text-[15px] text-muted">
            {branch.name} is closed right now — you can browse, but ordering opens with the
            kitchen. Hours are on the restaurant page.
          </p>
        )}

        {/* Browsing a different branch than the cart — informational, not a blocker. */}
        {cart.branchId && cart.branchId !== branch.id && cart.lines.length > 0 && (
          <div
            role="status"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-border bg-surface px-4 py-3"
          >
            <p className="text-[15px]">
              You're browsing <strong className="font-[650]">{branch.name}</strong> — your basket
              is from{' '}
              <strong className="font-[650]">
                {cart.restaurantName}
                {cart.branchName ? `, ${cart.branchName}` : ''}
              </strong>
              .
            </p>
            {cart.restaurantSlug && cart.branchId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate(paths.restaurantMenu(cart.restaurantSlug!, cart.branchId!))
                }
              >
                Back to {cart.branchName ?? 'your basket'}
              </Button>
            )}
          </div>
        )}
      </header>

      {menuQuery.isError ? (
        <ErrorState message={errorMessage(menuQuery.error)} onRetry={() => void menuQuery.refetch()} />
      ) : !menu ? (
        <div className="grid gap-6 pt-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[4/3] w-full rounded-[16px]" />
              <Skeleton className="mt-3 h-5 w-3/5" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </div>
          ))}
        </div>
      ) : menu.categories.length === 0 ? (
        <EmptyState
          title="Menu coming soon"
          body={`${branch.name} hasn't published its menu yet. Try another location, or check back shortly.`}
          action={
            restaurant.branches.length > 1 ? (
              <Button variant="outline" onClick={() => setPickerOpen(true)}>
                Try another location
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Category nav — sticky under the header. */}
          <nav
            aria-label="Menu categories"
            className="sticky top-16 -mx-4 border-b border-border/70 bg-bg/95 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
            style={{ zIndex: 'calc(var(--z-sticky) - 1)' }}
          >
            <div className="flex gap-1 overflow-x-auto">
              {menu.categories.map((category) => (
                <a
                  key={category.id}
                  href={`#${categoryAnchor(category.id)}`}
                  className={cn(
                    'shrink-0 rounded-full px-4 py-2 text-[15px] font-[550] transition-colors',
                    activeCategory === categoryAnchor(category.id)
                      ? 'bg-basil-tint text-basil-deep'
                      : 'text-muted hover:bg-surface hover:text-ink',
                  )}
                >
                  {category.name}
                </a>
              ))}
            </div>
          </nav>

          {menu.categories.map((category) => (
            <section
              key={category.id}
              id={categoryAnchor(category.id)}
              ref={(el) => {
                if (el) sectionsRef.current.set(categoryAnchor(category.id), el)
                else sectionsRef.current.delete(categoryAnchor(category.id))
              }}
              aria-labelledby={`${categoryAnchor(category.id)}-heading`}
              className="scroll-mt-32 pt-10"
            >
              <h2 id={`${categoryAnchor(category.id)}-heading`} className="display text-2xl">
                {category.name}
              </h2>
              <ul className="mt-5 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {category.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => item.isAvailable && setActiveItem(item)}
                      disabled={!item.isAvailable}
                      className="group w-full text-left disabled:cursor-not-allowed"
                      aria-label={`${item.name}, ${
                        item.onlinePromoPriceCents != null
                          ? `now ${formatCents(item.onlinePromoPriceCents)}, was ${formatCents(item.priceCents)}`
                          : formatCents(item.priceCents)
                      }${item.isAvailable ? '' : ', sold out'}`}
                    >
                      <div className="relative overflow-hidden rounded-[16px]">
                        <FoodImage
                          src={item.imageUrl ?? null}
                          alt=""
                          fallbackLabel={item.name}
                          className={cn(
                            'aspect-[4/3] w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                            item.isAvailable && 'group-hover:scale-[1.04]',
                            !item.isAvailable && 'opacity-50 saturate-50',
                          )}
                        />
                        {!item.isAvailable && (
                          <Badge variant="neutral" className="absolute top-3 left-3 bg-bg/90">
                            Sold out today
                          </Badge>
                        )}
                      </div>
                      <div className="mt-3 flex items-baseline justify-between gap-3">
                        <h3 className="font-[650]">{item.name}</h3>
                        {item.onlinePromoPriceCents != null ? (
                          <PriceWasNow
                            baseCents={item.priceCents}
                            promoCents={item.onlinePromoPriceCents}
                            className="shrink-0 justify-end"
                          />
                        ) : (
                          <p className="tabular-nums shrink-0 text-muted">
                            {formatCents(item.priceCents)}
                          </p>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-1 line-clamp-2 text-[15px] text-muted">{item.description}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <ItemDialog
        item={activeItem}
        restaurant={{ id: restaurant.id, name: restaurant.name, slug: restaurant.slug }}
        branchId={branch.id}
        branchName={branch.name}
        onClose={() => setActiveItem(null)}
      />

      <BranchPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        branches={restaurant.branches}
        selectedId={branch.id}
        title={`Choose a ${restaurant.name} location`}
        onSelected={(b) => {
          rememberBranch(b.id)
          navigate(paths.restaurantMenu(restaurant.slug, b.id))
        }}
      />
    </main>
  )
}
