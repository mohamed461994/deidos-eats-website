/**
 * Home (`/`) — the branch-first marketplace front door (HOME_ADMIN_PLAN §2).
 * One aggregate read (`GET /marketplace/home`) drives banners, the two
 * merchandising strips, the server-sorted branch feed, and admin copy; the
 * existing restaurants query joins brand imagery onto branch cards and feeds
 * the town picker. Location (geolocation or town) only ever re-sorts — it
 * never gates browsing. Every empty section collapses; every card is one tap
 * from a branch menu.
 */
import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'

import { errorMessage } from '@/api'
import { queryKeys, useMarketplaceHome, useRestaurants } from '@/api/queries'
import type { MarketplaceBranch, Restaurant } from '@/api/types'
import { BranchCard, type BranchBrand } from '@/components/home/branch-card'
import { BannerStrip } from '@/components/home/banner-strip'
import { ItemStrip } from '@/components/home/item-strip'
import { LocationControl } from '@/components/home/location-control'
import { StoreBadges } from '@/components/home/store-badges'
import { EmptyState, ErrorState } from '@/components/states'
import { Skeleton } from '@/components/ui/skeleton'
import { config } from '@/config'
import { townOptions, useHomeLocation } from '@/lib/location'
import { paths } from '@/lib/routes'
import { usePromoBoundaryRefresh } from '@/lib/use-promo-refresh'

const FEED_STAGGER_STEP_MS = 40
const FEED_MAX_STAGGER_INDEX = 5

export function HomePage() {
  const location = useHomeLocation()
  const homeQuery = useMarketplaceHome(location)
  const restaurantsQuery = useRestaurants()
  const restaurants = restaurantsQuery.data?.items
  const queryClient = useQueryClient()

  const home = homeQuery.data
  const located = location !== null

  // Refetch the moment the earliest visible promo ends (and after a sleeping
  // tab wakes) so a "was/now" price never outlives its promo.
  const promoBoundaries = useMemo(
    () =>
      [...(home?.ovenItems ?? []), ...(home?.discountedItems ?? [])].map(
        (item) => item.promoEndsAt,
      ),
    [home],
  )
  usePromoBoundaryRefresh(promoBoundaries, () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.marketplaceHomeAll })
  })

  // Restaurant branding joined onto branch cards (logo, imagery, precise status).
  const brandBySlug = useMemo(() => {
    const map = new Map<string, { restaurant: Restaurant; branchImages: Map<string, string | null> }>()
    for (const restaurant of restaurants ?? []) {
      map.set(restaurant.slug, {
        restaurant,
        branchImages: new Map(restaurant.branches.map((b) => [b.id, b.imageUrl ?? null])),
      })
    }
    return map
  }, [restaurants])

  function brandFor(branch: MarketplaceBranch): BranchBrand | undefined {
    const entry = brandBySlug.get(branch.restaurantSlug)
    if (!entry) return undefined
    return {
      logoUrl: entry.restaurant.logoUrl ?? null,
      imageUrl: entry.branchImages.get(branch.id) ?? entry.restaurant.heroImageUrl ?? null,
      marketplaceStatus: entry.restaurant.marketplaceStatus,
    }
  }

  // Rollback pin: behave as a single-restaurant site when a restaurant is pinned.
  if (config.restaurantId) {
    const pinned = restaurants?.find((r) => r.id === config.restaurantId)
    if (pinned) return <Navigate to={paths.restaurant(pinned.slug)} replace />
  }

  const content = home?.content
  const heroHeading = content?.heroHeading ?? 'Hungry? You’re in the right place.'
  const heroSubheading =
    content?.heroSubheading ??
    'Order from local kitchens for collection or delivery, and track it live from the pass to your door.'
  const ovenTitle = content?.ovenSectionTitle ?? 'From the oven'
  const discountedTitle = content?.discountedSectionTitle ?? 'On offer'
  const branchesTitle =
    content?.branchesSectionTitle ?? (located ? 'Kitchens near you' : 'Every kitchen')

  const feed = home?.branches
  const zeroRestaurants = home !== undefined && feed !== undefined && feed.items.length === 0

  return (
    <main>
      {/* The drench moment: paper-on-deep-basil, bookending the basil footer. */}
      <section aria-labelledby="home-hero-heading" className="bg-basil-deep">
        <div className="mx-auto max-w-6xl px-4 pt-[clamp(3rem,7vw,5rem)] pb-[clamp(2.5rem,6vw,4rem)] sm:px-6">
          <h1
            id="home-hero-heading"
            className="display rise-in max-w-[18ch] text-[clamp(2.5rem,6vw,4.25rem)] text-paper"
          >
            {heroHeading}
          </h1>
          <p className="rise-in-late mt-4 max-w-[52ch] text-lg text-paper-muted">
            {heroSubheading}
          </p>
          <div className="rise-in-late mt-7">
            <LocationControl location={location} towns={townOptions(home?.branches.items)} />
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-[clamp(3rem,7vw,4.5rem)] px-4 pt-[clamp(2rem,5vw,3rem)] pb-24 sm:px-6">
        {homeQuery.isError ? (
          <ErrorState
            message={errorMessage(homeQuery.error)}
            onRetry={() => void homeQuery.refetch()}
          />
        ) : !home ? (
          <HomeSkeleton />
        ) : zeroRestaurants ? (
          <>
            <BannerStrip banners={home.banners} />
            <EmptyState
              title="No restaurants yet"
              body="We're onboarding our first kitchens. Check back soon — the ovens are warming up."
            />
          </>
        ) : (
          <>
            <BannerStrip banners={home.banners} />

            <ItemStrip
              headingId="home-oven-heading"
              title={ovenTitle}
              subtitle="What the kitchens are proud of today."
              titleAccent={<span aria-hidden className="ember-dot" />}
              items={home.ovenItems}
            />

            <ItemStrip
              headingId="home-discounted-heading"
              title={discountedTitle}
              subtitle="Online prices, down for a limited time."
              items={home.discountedItems}
            />

            <section aria-labelledby="home-branches-heading">
              <h2 id="home-branches-heading" className="display text-[clamp(1.5rem,3vw,2rem)]">
                {branchesTitle}
              </h2>
              <p className="mt-1 text-[15px] text-muted">
                {located
                  ? 'Closest kitchens first.'
                  : 'Open kitchens first — set a location to sort by distance.'}
              </p>
              <ul className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {feed!.items.map((branch, index) => (
                  <li
                    key={branch.id}
                    className="rise-in flex"
                    style={{
                      animationDelay: `${Math.min(index, FEED_MAX_STAGGER_INDEX) * FEED_STAGGER_STEP_MS}ms`,
                    }}
                  >
                    <BranchCard branch={branch} brand={brandFor(branch)} />
                  </li>
                ))}
              </ul>
              {feed!.total > feed!.items.length && (
                <p className="mt-6 text-center text-[15px] text-muted">
                  And {feed!.total - feed!.items.length} more — set a location to bring the
                  closest to the top.
                </p>
              )}
            </section>

            <StoreBadges content={home.content} />

            {home.content.footerNote && (
              <p className="text-center text-[13px] text-muted">{home.content.footerNote}</p>
            )}
          </>
        )}
      </div>
    </main>
  )
}

/** Photo-shaped placeholders in the exact rhythm the loaded page uses. */
function HomeSkeleton() {
  return (
    <>
      <Skeleton className="aspect-[5/2] w-full rounded-[24px] sm:aspect-[3/1]" />
      <div>
        <Skeleton className="h-8 w-48" />
        <div className="-mx-4 mt-5 flex gap-5 overflow-hidden px-4 sm:-mx-6 sm:px-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="w-[230px] shrink-0 sm:w-[256px]">
              <Skeleton className="aspect-[4/3] w-full rounded-[16px]" />
              <Skeleton className="mt-3 h-5 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-8 w-56" />
        <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-[20px] border border-border">
              <Skeleton className="aspect-[16/9] w-full rounded-none" />
              <div className="flex flex-col gap-3 p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
