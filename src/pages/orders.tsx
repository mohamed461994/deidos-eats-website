import { ChevronRight } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { errorMessage } from '@/api'
import { useMyOrders } from '@/api/queries'
import type { OrderStatus } from '@/api/types'
import { useAuth } from '@/auth/context'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCents } from '@/lib/money'

const STATUS_BADGES: Record<OrderStatus, { label: string; variant: 'basil-soft' | 'ember-soft' | 'neutral' | 'error' }> = {
  placed: { label: 'Placed', variant: 'ember-soft' },
  accepted: { label: 'Accepted', variant: 'ember-soft' },
  preparing: { label: 'In the oven', variant: 'ember-soft' },
  ready: { label: 'Ready', variant: 'basil-soft' },
  out_for_delivery: { label: 'On its way', variant: 'basil-soft' },
  completed: { label: 'Completed', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
  rejected: { label: 'Declined', variant: 'error' },
  refunded: { label: 'Refunded', variant: 'neutral' },
}

const ACTIVE_STATUSES: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready', 'out_for_delivery']

export function OrdersPage() {
  const { status } = useAuth()
  const ordersQuery = useMyOrders()
  const navigate = useNavigate()

  if (status === 'signedOut') return <Navigate to="/signin?next=/orders" replace />

  const orders = ordersQuery.data?.items ?? []
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status))
  const past = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status))

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-6">
        <h1 className="display text-[clamp(2rem,4.5vw,3rem)]">Your orders</h1>
      </header>

      {ordersQuery.isError ? (
        <ErrorState message={errorMessage(ordersQuery.error)} onRetry={() => void ordersQuery.refetch()} />
      ) : ordersQuery.isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[16px]" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          body="Your first one is a big moment. The oven’s been warming up for it."
          action={<Button onClick={() => navigate('/menu')}>Browse the menu</Button>}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {active.length > 0 && (
            <section aria-labelledby="active-heading">
              <h2 id="active-heading" className="mb-3 flex items-center gap-2 text-sm font-[650] text-muted">
                <span className="ember-dot" aria-hidden />
                Happening now
              </h2>
              <OrderLinks orders={active} />
            </section>
          )}
          {past.length > 0 && (
            <section aria-labelledby="past-heading">
              <h2 id="past-heading" className="mb-3 text-sm font-[650] text-muted">
                Earlier
              </h2>
              <OrderLinks orders={past} />
            </section>
          )}
        </div>
      )}
    </main>
  )
}

function OrderLinks({ orders }: { orders: NonNullable<ReturnType<typeof useMyOrders>['data']>['items'] }) {
  return (
    <ul className="flex flex-col gap-3">
      {orders.map((order) => {
        const badge = STATUS_BADGES[order.status]
        const placedAt = new Date(order.placedAt)
        return (
          <li key={order.id}>
            <Link
              to={`/orders/${order.id}`}
              className="flex items-center gap-4 rounded-[16px] border border-border p-4 transition-colors hover:bg-surface"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-[650]">{order.restaurantName}</p>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <p className="mt-1 text-[13px] text-muted">
                  {order.branchName} ·{' '}
                  {placedAt.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })} ·{' '}
                  {placedAt.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                  {order.fulfillmentType === 'delivery' ? 'Delivery' : 'Collection'}
                </p>
              </div>
              <p className="tabular-nums font-[650]">{formatCents(order.totalCents)}</p>
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
