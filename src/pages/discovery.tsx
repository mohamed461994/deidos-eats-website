import { Bike, ShoppingBag } from 'lucide-react'
import { Navigate } from 'react-router-dom'

import { errorMessage } from '@/api'
import { useRestaurants } from '@/api/queries'
import { RestaurantCard } from '@/components/restaurant-card'
import { EmptyState, ErrorState } from '@/components/states'
import { Skeleton } from '@/components/ui/skeleton'
import { config } from '@/config'
import { paths } from '@/lib/routes'

/**
 * Discovery (`/`) — the marketplace front door. Editorial, not a sparse grid:
 * at N=2 it's a "Choose a restaurant" heading, fulfillment context up top, and
 * two large feature cards. No empty search bar, no dead filters — the layout
 * leaves headroom for Phase 3 discovery features without shipping them now
 * (plan §6.2.2). `VITE_RESTAURANT_ID`, when set, pins the site to one restaurant
 * (legacy/rollback) by redirecting straight into its home.
 */
export function DiscoveryPage() {
  const { data, isPending, isError, error, refetch } = useRestaurants()
  const restaurants = data?.items ?? []

  // Rollback pin: behave as a single-restaurant site when a restaurant is pinned.
  if (config.restaurantId) {
    const pinned = restaurants.find((r) => r.id === config.restaurantId)
    if (pinned) return <Navigate to={paths.restaurant(pinned.slug)} replace />
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="pt-14 pb-10 sm:pt-20">
        <h1 className="display rise-in text-[clamp(2.5rem,6vw,4.25rem)]">Choose a restaurant</h1>
        <p className="rise-in-late mt-4 max-w-md text-lg text-muted">
          Order from local kitchens for collection or delivery, and track it live from the
          pass to your door.
        </p>
        <div className="rise-in-late mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[15px] font-[550] text-ink">
          <span className="flex items-center gap-2">
            <ShoppingBag className="size-4 text-basil" aria-hidden />
            Collection
          </span>
          <span className="flex items-center gap-2">
            <Bike className="size-4 text-basil" aria-hidden />
            Delivery across Ireland
          </span>
        </div>
      </header>

      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-[24px] border border-border">
              <Skeleton className="aspect-[16/10] w-full rounded-none" />
              <div className="flex flex-col gap-3 p-6">
                <Skeleton className="h-7 w-1/2" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="mt-2 h-5 w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : restaurants.length === 0 ? (
        <EmptyState
          title="No restaurants yet"
          body="We're onboarding our first kitchens. Check back soon — the ovens are warming up."
        />
      ) : (
        <>
          <ul className="grid gap-6 md:grid-cols-2">
            {restaurants.map((restaurant) => (
              <li key={restaurant.id} className="flex">
                <div className="flex-1">
                  <RestaurantCard restaurant={restaurant} />
                </div>
              </li>
            ))}
          </ul>
          {/* Restrained headroom for Phase 3 — a quiet note, never a fake third card. */}
          <p className="mt-10 flex items-center justify-center gap-2 text-[15px] text-muted">
            <span aria-hidden className="ember-dot" />
            More restaurants coming soon.
          </p>
        </>
      )}
    </main>
  )
}
