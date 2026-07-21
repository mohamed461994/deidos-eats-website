/**
 * Home (`/`) — the branch-first marketplace front door (HOME_ADMIN_PLAN §2).
 * One aggregate read (`GET /marketplace/home`) drives banners, the two
 * merchandising strips, the server-sorted branch feed, and admin copy; the
 * existing restaurants query joins brand imagery onto branch cards and feeds
 * the town picker. Location (geolocation or town) only ever re-sorts — it
 * never gates browsing. Every empty section collapses; every card is one tap
 * from a branch menu.
 */
import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { errorMessage } from '@/api'
import { useMarketplaceHome, useRestaurants } from '@/api/queries'
import type { MarketplaceItem } from '@/api/types'
import { BranchCard, type BranchBrand } from '@/components/home/branch-card'
import { BannerStrip } from '@/components/home/banner-strip'
import { ItemStrip } from '@/components/home/item-strip'
import { LocationControl } from '@/components/home/location-control'
import { StoreBadges } from '@/components/home/store-badges'
import { QuickAddDialog } from '@/components/quick-add-dialog'
import { EmptyState, ErrorState } from '@/components/states'
import { Skeleton } from '@/components/ui/skeleton'
import { townOptions, useHomeLocation } from '@/lib/location'
import { pinnedRestaurantOf } from '@/lib/restaurant'
import { paths } from '@/lib/routes'
import { staggerDelayMs } from '@/lib/utils'

export function HomePage() {
  const location = useHomeLocation()
  const homeQuery = useMarketplaceHome(location)
  const restaurantsQuery = useRestaurants()
  const restaurants = restaurantsQuery.data?.items

  // The strip item being customised — its add-to-basket dialog opens in place
  // over the home feed, so buyers never bounce out to the full menu to add it.
  const [quickAddItem, setQuickAddItem] = useState<MarketplaceItem | null>(null)

  const home = homeQuery.data
  const located = location !== null

  // Restaurant branding joined onto branch cards (logo, imagery, precise
  // status), precomputed per branch so memoized cards get stable props. The
  // slug-level entry is the fallback for a feed branch the (staler)
  // restaurants cache doesn't know yet — it still gets its restaurant's hero,
  // logo, and paused/comingSoon badge instead of a bare "Closed" card.
  const brandJoin = useMemo(() => {
    const byBranchId = new Map<string, BranchBrand>()
    const bySlug = new Map<string, BranchBrand>()
    for (const restaurant of restaurants ?? []) {
      const restaurantBrand: BranchBrand = {
        logoUrl: restaurant.logoUrl ?? null,
        imageUrl: restaurant.heroImageUrl ?? null,
        marketplaceStatus: restaurant.marketplaceStatus,
      }
      bySlug.set(restaurant.slug, restaurantBrand)
      for (const branch of restaurant.branches) {
        byBranchId.set(branch.id, {
          ...restaurantBrand,
          imageUrl: branch.imageUrl ?? restaurantBrand.imageUrl,
        })
      }
    }
    return { byBranchId, bySlug }
  }, [restaurants])

  // Town picker options: the feed carries every published branch with coords
  // today; the restaurants query is merged in so the list stays complete even
  // if the feed is ever capped (it self-heals as BranchSummary coords ship).
  const feedBranches = home?.branches.items
  const towns = useMemo(
    () =>
      townOptions([...(feedBranches ?? []), ...(restaurants ?? []).flatMap((r) => r.branches)]),
    [feedBranches, restaurants],
  )

  // Rollback pin: behave as a single-restaurant site when a restaurant is pinned.
  const pinned = pinnedRestaurantOf(restaurants)
  if (pinned) return <Navigate to={paths.restaurant(pinned.slug)} replace />

  const content = home?.content
  // Admin copy renders verbatim; only the crafted default gets the crust-gold
  // accent word (a JSX default — a string override can't carry the span).
  const heroHeading = content?.heroHeading ?? (
    <>
      Menus worth getting <span className="text-crust">hungry</span> for.
    </>
  )
  const heroSubheading =
    content?.heroSubheading ??
    'Pick a kitchen near you, order for collection or delivery, and track it live from the pass to your door.'
  const ovenTitle = content?.ovenSectionTitle ?? 'From the oven'
  const discountedTitle = content?.discountedSectionTitle ?? 'On offer'
  const branchesTitle =
    content?.branchesSectionTitle ?? (located ? 'Kitchens near you' : 'Every kitchen')

  return (
    <main>
      {/* The drench moment: paper-on-deep-basil, bookending the basil footer. */}
      <section aria-labelledby="home-hero-heading" className="bg-basil-deep">
        <div className="mx-auto max-w-6xl px-4 pt-[clamp(2rem,4.5vw,3rem)] pb-[clamp(2.5rem,6vw,4rem)] sm:px-6">
          <h1
            id="home-hero-heading"
            className="display rise-in max-w-[20ch] text-[clamp(2.75rem,8vw,5.5rem)] text-paper"
          >
            {heroHeading}
          </h1>
          <p className="rise-in-late mt-5 max-w-[52ch] text-lg text-paper-muted sm:text-xl">
            {heroSubheading}
          </p>
          <div className="rise-in-late mt-7">
            <LocationControl location={location} towns={towns} />
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
        ) : home.branches.items.length === 0 ? (
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
              onSelect={setQuickAddItem}
            />

            <ItemStrip
              headingId="home-discounted-heading"
              title={discountedTitle}
              subtitle="Online prices, down for a limited time."
              items={home.discountedItems}
              onSelect={setQuickAddItem}
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
                {home.branches.items.map((branch, index) => (
                  <li
                    key={branch.id}
                    className="rise-in flex"
                    style={{ animationDelay: staggerDelayMs(index) }}
                  >
                    <BranchCard
                      branch={branch}
                      brand={
                        brandJoin.byBranchId.get(branch.id) ??
                        brandJoin.bySlug.get(branch.restaurantSlug)
                      }
                    />
                  </li>
                ))}
              </ul>
              {home.branches.total > home.branches.items.length && (
                <p className="mt-6 text-center text-[15px] text-muted">
                  And {home.branches.total - home.branches.items.length} more — set a location
                  to bring the closest to the top.
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

      <QuickAddDialog item={quickAddItem} onClose={() => setQuickAddItem(null)} />
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
