import { ArrowRight, Bike, Clock, MapPin, ShoppingBag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import type { BranchSummary } from '@/api/types'
import { FoodImage } from '@/components/food-image'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { useRememberedBranch } from '@/lib/branch-selection'
import { availabilityOf } from '@/lib/restaurant'
import { paths } from '@/lib/routes'
import { cn } from '@/lib/utils'

import { useRestaurantRoute } from './restaurant-layout'

export function RestaurantHomePage() {
  const restaurant = useRestaurantRoute()
  const navigate = useNavigate()
  const [, rememberBranch] = useRememberedBranch(restaurant.id)
  const availability = availabilityOf(restaurant)
  const hasHero = !!restaurant.heroImageUrl
  const orderable = availability.canOrderNow || restaurant.marketplaceStatus === 'paused'

  function goToBranch(branch: BranchSummary) {
    rememberBranch(branch.id)
    navigate(paths.restaurantMenu(restaurant.slug, branch.id))
  }

  return (
    <main>
      {/* Hero — the restaurant's OWN brand, API-driven (name/tagline/image).
          No hero image → a clean basil drench with the wordmark, never a broken
          image and never another restaurant's photo (DESIGN.md). */}
      <section className="relative isolate flex min-h-[62dvh] items-end overflow-hidden bg-basil-deep">
        {hasHero && (
          <>
            <img
              src={restaurant.heroImageUrl ?? undefined}
              alt={restaurant.heroImageAlt ?? ''}
              className="absolute inset-0 size-full object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-[oklch(0.2_0.07_143/0.9)] via-[oklch(0.2_0.07_143/0.4)] to-[oklch(0.2_0.07_143/0.15)]"
            />
          </>
        )}
        <div className="relative mx-auto w-full max-w-6xl px-4 pt-32 pb-12 sm:px-6 sm:pb-16">
          {restaurant.logoUrl && (
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              className="rise-in mb-5 size-16 rounded-[16px] object-cover shadow-floating"
            />
          )}
          <div className="rise-in">
            <AvailabilityPill availability={availability} />
          </div>
          <h1 className="display rise-in mt-3 max-w-3xl text-paper text-[clamp(2.5rem,7vw,4.75rem)]">
            {restaurant.name}
          </h1>
          {restaurant.tagline && (
            <p className="rise-in-late mt-4 max-w-xl text-lg text-paper-muted">
              {restaurant.tagline}
            </p>
          )}
          {availability.canOrderNow && restaurant.branches.length > 0 && (
            <div className="rise-in-late mt-8">
              <Button
                variant="paper"
                size="lg"
                onClick={() => {
                  document.getElementById('locations')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                Start an order
                <ArrowRight className="size-4.5" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {/* Coming soon — the one state where there are no order CTAs at all. */}
        {restaurant.marketplaceStatus === 'comingSoon' ? (
          <EmptyState
            title="Coming soon"
            body={`${restaurant.name} is getting ready to open on Deidos Eats. Check back soon to place your first order.`}
          />
        ) : restaurant.branches.length === 0 ? (
          <EmptyState
            title="No locations yet"
            body={`${restaurant.name} hasn't added any branches to order from. Check back soon.`}
          />
        ) : (
          <section aria-labelledby="locations-heading" id="locations" className="scroll-mt-24 pt-14 sm:pt-20">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="locations-heading" className="display text-[clamp(2rem,4.5vw,3rem)]">
                {restaurant.branches.length === 1 ? 'Where to find us' : 'Choose a location'}
              </h2>
              <p className="mb-1.5 text-[15px] text-muted">{availability.label}</p>
            </div>

            {restaurant.marketplaceStatus === 'paused' && (
              <p
                role="status"
                className="mt-5 rounded-[16px] border border-warning/40 bg-crust-tint px-4 py-3.5 text-[15px]"
              >
                {restaurant.name} isn't taking orders right now. You can still browse the menu —
                we'll let you order the moment they're back.
              </p>
            )}

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {restaurant.branches.map((branch) => (
                <article
                  key={branch.id}
                  className="group flex flex-col overflow-hidden rounded-[24px] border border-border bg-bg shadow-raised"
                >
                  <FoodImage
                    src={branch.imageUrl ?? null}
                    alt=""
                    fallbackLabel={branch.name}
                    className="aspect-[16/9] w-full"
                  />
                  <div className="flex flex-1 flex-col gap-3 p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="display text-xl">{branch.name}</h3>
                      <span
                        className={cn(
                          'flex shrink-0 items-center gap-1.5 text-sm font-[650]',
                          branch.isOpen ? 'text-basil' : 'text-muted',
                        )}
                      >
                        <Clock className="size-4" aria-hidden />
                        {branch.isOpen ? 'Open now' : 'Closed'}
                      </span>
                    </div>
                    {branch.town && (
                      <p className="flex items-center gap-1.5 text-[15px] text-muted">
                        <MapPin className="size-4 shrink-0 text-basil" aria-hidden />
                        {branch.town}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
                      {branch.fulfillment.collectionEnabled && (
                        <span className="flex items-center gap-1.5">
                          <ShoppingBag className="size-4 text-basil" aria-hidden />
                          Collection
                        </span>
                      )}
                      {branch.fulfillment.deliveryEnabled && (
                        <span className="flex items-center gap-1.5">
                          <Bike className="size-4 text-basil" aria-hidden />
                          Delivery
                        </span>
                      )}
                    </div>
                    <Button
                      className="mt-auto self-start"
                      variant={orderable ? 'primary' : 'outline'}
                      onClick={() => goToBranch(branch)}
                    >
                      {availability.canOrderNow ? 'Order from here' : 'Browse menu'}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

/** The availability badge as it sits on the dark hero. */
function AvailabilityPill({ availability }: { availability: ReturnType<typeof availabilityOf> }) {
  const live = availability.tone === 'open' || availability.tone === 'partial'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/15 px-3 py-1 text-[13px] font-[650] text-paper backdrop-blur-sm">
      {live && <span aria-hidden className="ember-dot" />}
      {availability.label}
    </span>
  )
}
