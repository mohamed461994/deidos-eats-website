import { createContext, useContext } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'

import { errorMessage, isApiError } from '@/api'
import { useRestaurantBySlug } from '@/api/queries'
import type { Restaurant } from '@/api/types'
import { ErrorState } from '@/components/states'
import { Skeleton } from '@/components/ui/skeleton'
import { paths } from '@/lib/routes'

const RestaurantContext = createContext<Restaurant | null>(null)

/** The restaurant resolved from the `/r/:slug` route — for nested pages only. */
// eslint-disable-next-line react-refresh/only-export-components
export function useRestaurantRoute(): Restaurant {
  const restaurant = useContext(RestaurantContext)
  if (!restaurant) throw new Error('useRestaurantRoute must be used inside a resolved <RestaurantLayout>')
  return restaurant
}

/**
 * Resolves `/r/:slug` to a restaurant and provides it to the nested restaurant
 * home / menu routes (cache key `['restaurant', id]`, seeded from the by-slug
 * lookup). An unknown or non-published slug 404s → a real soft-404 UI (never a
 * 200 generic page). Per-page availability (comingSoon/paused/empty) is handled
 * by the child pages; the layout only resolves identity.
 */
export function RestaurantLayout() {
  const { slug } = useParams<{ slug: string }>()
  const { data: restaurant, isPending, isError, error, refetch } = useRestaurantBySlug(slug)

  if (isPending) {
    return (
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Skeleton className="mt-8 aspect-[21/9] w-full rounded-[24px]" />
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-[24px]" />
          <Skeleton className="h-56 w-full rounded-[24px]" />
        </div>
      </main>
    )
  }

  if (isError) {
    // Unknown / non-published slug → soft-404. Any other error → retryable.
    if (isApiError(error) && error.status === 404) {
      return (
        <main className="mx-auto flex max-w-md flex-col items-start gap-4 px-4 py-24 sm:px-6">
          <p className="text-sm font-[650] text-muted">404</p>
          <h1 className="display text-4xl">We can't find that restaurant.</h1>
          <p className="text-muted">
            The link may be out of date, or the restaurant isn't on Deidos Eats yet. Browse the
            ones that are.
          </p>
          <Link
            to={paths.discovery()}
            className="mt-2 inline-flex h-11 items-center rounded-full bg-basil px-6 text-[15px] font-[550] text-on-basil transition-colors hover:bg-basil-hover"
          >
            See all restaurants
          </Link>
        </main>
      )
    }
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      </main>
    )
  }

  return (
    <RestaurantContext.Provider value={restaurant}>
      <Outlet />
    </RestaurantContext.Provider>
  )
}
