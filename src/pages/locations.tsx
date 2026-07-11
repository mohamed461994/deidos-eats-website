import { Bike, Clock, MapPin, ShoppingBag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { errorMessage } from '@/api'
import { useBranch } from '@/api/queries'
import { FoodImage } from '@/components/food-image'
import { EmptyState, ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRememberedBranch } from '@/lib/branch-selection'
import { hoursByDay } from '@/lib/hours'
import { mapsUrlFor } from '@/lib/maps'
import { formatCents } from '@/lib/money'
import { paths } from '@/lib/routes'

import { useRestaurantRoute } from './restaurant-layout'

function BranchCard({ branchId, restaurantSlug, restaurantId }: { branchId: string; restaurantSlug: string; restaurantId: string }) {
  const { data: branch, isError, error, refetch } = useBranch(branchId)
  const navigate = useNavigate()
  const [, rememberBranch] = useRememberedBranch(restaurantId)

  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
  if (!branch) {
    return (
      <div className="overflow-hidden rounded-[24px] border border-border">
        <Skeleton className="aspect-[16/9] w-full rounded-none" />
        <div className="flex flex-col gap-3 p-6">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  const mapsUrl = mapsUrlFor(branch.name, branch.address)

  return (
    <article className="overflow-hidden rounded-[24px] border border-border bg-bg shadow-raised">
      <FoodImage src={branch.imageUrl ?? null} alt="" fallbackLabel={branch.name} className="aspect-[16/9] w-full" />
      <div className="flex flex-col gap-5 p-6">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="display text-2xl">{branch.name}</h2>
            <span
              className={
                branch.isOpen
                  ? 'flex shrink-0 items-center gap-1.5 text-sm font-[650] text-basil'
                  : 'flex shrink-0 items-center gap-1.5 text-sm font-[650] text-muted'
              }
            >
              <Clock className="size-4" aria-hidden />
              {branch.isOpen ? 'Open now' : 'Closed'}
            </span>
          </div>
          {branch.description && <p className="mt-2 text-[15px] text-muted">{branch.description}</p>}
        </div>

        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-2 text-[15px] text-ink underline-offset-4 hover:underline"
        >
          <MapPin className="mt-0.5 size-4 shrink-0 text-basil" aria-hidden />
          {branch.address.line1}, {branch.address.town}, {branch.address.eircode}
        </a>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          {branch.fulfillment.collectionEnabled && (
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="size-4 text-basil" aria-hidden />
              Collection
            </span>
          )}
          {branch.fulfillment.deliveryEnabled && (
            <span className="flex items-center gap-1.5">
              <Bike className="size-4 text-basil" aria-hidden />
              Delivery{' '}
              {branch.fulfillment.deliveryFeeCents != null && (
                <span className="text-muted">
                  from {formatCents(branch.fulfillment.deliveryFeeCents)}
                  {branch.fulfillment.minOrderCents != null &&
                    ` · min ${formatCents(branch.fulfillment.minOrderCents)}`}
                </span>
              )}
            </span>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-[650] text-muted">Opening hours</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[15px]">
            {hoursByDay(branch.openingHours).map(({ day, ranges }) => (
              <div key={day} className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-muted">{day}</dt>
                <dd className="tabular-nums text-right">
                  {ranges.length > 0 ? ranges.join(', ') : 'Closed'}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <Button
          className="self-start"
          onClick={() => {
            rememberBranch(branch.id)
            navigate(paths.restaurantMenu(restaurantSlug, branch.id))
          }}
        >
          Order from {branch.name}
        </Button>
      </div>
    </article>
  )
}

/** A restaurant's locations (`/r/:slug/locations`) — branches, hours, fulfillment. */
export function LocationsPage() {
  const restaurant = useRestaurantRoute()

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-8">
        <p className="text-sm font-[650] text-muted">{restaurant.name}</p>
        <h1 className="display mt-1 text-[clamp(2rem,4.5vw,3.25rem)]">Locations &amp; hours</h1>
        <p className="mt-3 max-w-lg text-muted">
          Collection and delivery details for every {restaurant.name} branch — hours below are
          kitchen hours, and the site always knows when each is open.
        </p>
      </header>
      {restaurant.branches.length === 0 ? (
        <EmptyState
          title="No locations yet"
          body={`${restaurant.name} hasn't added any branches to order from. Check back soon.`}
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          {restaurant.branches.map((b) => (
            <BranchCard
              key={b.id}
              branchId={b.id}
              restaurantId={restaurant.id}
              restaurantSlug={restaurant.slug}
            />
          ))}
        </div>
      )}
    </main>
  )
}
