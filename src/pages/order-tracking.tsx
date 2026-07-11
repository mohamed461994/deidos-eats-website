import { useQueryClient } from '@tanstack/react-query'
import { Check, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'

import { errorMessage } from '@/api'
import { queryKeys, useBranch, useCancelOrder, useOrder } from '@/api/queries'
import type { Order, OrderStatus } from '@/api/types'
import { connectOrderEvents } from '@/api/ws'
import { useAuth } from '@/auth/context'
import { ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { mapsUrlFor } from '@/lib/maps'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

const STEP_LABELS: Record<string, { title: string; body: string }> = {
  placed: { title: 'Order placed', body: 'The kitchen has your order.' },
  accepted: { title: 'Accepted', body: 'The kitchen said yes. Dough incoming.' },
  preparing: { title: 'In the oven', body: 'Your order is being fired.' },
  ready: { title: 'Ready to collect', body: 'Come and get it while it’s blistering.' },
  out_for_delivery: { title: 'Out for delivery', body: 'On its way to your door.' },
  completed: { title: 'Enjoy', body: 'Done and dusted (with parmesan).' },
}

function stepsFor(order: Order): OrderStatus[] {
  const handoff: OrderStatus = order.fulfillmentType === 'delivery' ? 'out_for_delivery' : 'ready'
  return ['placed', 'accepted', 'preparing', handoff, 'completed']
}

function paymentLabel(order: Order): string | null {
  switch (order.paymentStatus) {
    case 'requires_payment':
      return 'Awaiting payment'
    case 'refund_pending':
      return 'Refund on the way'
    case 'refunded':
      return 'Refunded'
    case 'failed':
      return 'Payment failed'
    default:
      return null
  }
}

export function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const { status: authStatus, getAccessToken } = useAuth()
  const orderQuery = useOrder(orderId)
  const order = orderQuery.data
  // Collection orders show where to pick up — only fetch the branch for those.
  const collectionBranchId = order?.fulfillmentType === 'collection' ? order.branchId : null
  const collectionBranchQuery = useBranch(collectionBranchId)
  const cancelMutation = useCancelOrder(orderId ?? '')
  const queryClient = useQueryClient()
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  // Live updates: WS poke → refetch the authoritative order via REST
  useEffect(() => {
    if (authStatus !== 'signedIn' || !orderId) return
    const connection = connectOrderEvents(getAccessToken, (message) => {
      if (message.orderId === orderId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.orders })
      }
    })
    return () => connection.close()
  }, [authStatus, orderId, getAccessToken, queryClient])

  if (authStatus === 'signedOut') {
    return <Navigate to={`/signin?next=/orders/${orderId}`} replace />
  }

  if (orderQuery.isError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <ErrorState message={errorMessage(orderQuery.error)} onRetry={() => void orderQuery.refetch()} />
      </main>
    )
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-6 h-64 w-full" />
        <Skeleton className="mt-6 h-40 w-full" />
      </main>
    )
  }

  const steps = stepsFor(order)
  const terminated = order.status === 'cancelled' || order.status === 'rejected'
  const currentIndex = steps.indexOf(order.status)
  const payment = paymentLabel(order)

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-6">
        <p className="text-sm font-[650] text-muted">
          {order.branchName} · {order.fulfillmentType === 'delivery' ? 'Delivery' : 'Collection'}
        </p>
        <h1 className="display mt-1 text-[clamp(2rem,4.5vw,3rem)]">
          {terminated
            ? order.status === 'cancelled'
              ? 'Order cancelled'
              : 'Order declined'
            : (STEP_LABELS[order.status]?.title ?? 'Your order')}
        </h1>
        {payment && (
          <Badge variant={order.paymentStatus === 'failed' ? 'error' : 'crust'} className="mt-3">
            {payment}
          </Badge>
        )}
      </header>

      {/* Live status — announced to screen readers as it changes */}
      <section aria-labelledby="status-heading" aria-live="polite">
        <h2 id="status-heading" className="sr-only">
          Order status
        </h2>
        {terminated ? (
          <div className="rounded-[16px] border border-border bg-surface p-5">
            <p className="text-[15px]">
              {order.status === 'cancelled'
                ? 'This order was cancelled.'
                : 'The kitchen couldn’t take this order.'}{' '}
              {order.paymentMethod === 'card' &&
                (order.paymentStatus === 'refunded'
                  ? 'Your card has been refunded.'
                  : order.paymentStatus === 'refund_pending'
                    ? 'Your card refund is on the way — usually a few minutes.'
                    : null)}
            </p>
          </div>
        ) : (
          <ol className="flex flex-col">
            {steps.map((step, index) => {
              const reached = index <= currentIndex
              const isCurrent = index === currentIndex
              const isLast = index === steps.length - 1
              return (
                <li key={step} className="relative flex gap-4 pb-8 last:pb-0">
                  {!isLast && (
                    <span
                      aria-hidden
                      className={cn(
                        'absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5 rounded-full transition-colors duration-500',
                        index < currentIndex ? 'bg-basil' : 'bg-border',
                      )}
                    />
                  )}
                  <span
                    aria-hidden
                    className={cn(
                      'relative grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors duration-500',
                      reached ? 'border-basil bg-basil text-on-basil' : 'border-border bg-bg text-muted',
                    )}
                  >
                    {index < currentIndex ? (
                      <Check className="size-4" aria-hidden />
                    ) : isCurrent ? (
                      <span className="ember-dot" />
                    ) : (
                      <span className="text-[13px] font-[650]">{index + 1}</span>
                    )}
                  </span>
                  <div className={cn('pt-0.5', !reached && 'opacity-50')}>
                    <p className="font-[650]">{STEP_LABELS[step]?.title}</p>
                    {isCurrent && (
                      <p className="text-[15px] text-muted">{STEP_LABELS[step]?.body}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Where to collect — pickup address + maps link for collection orders */}
      {order.fulfillmentType === 'collection' && collectionBranchQuery.data && (
        <section aria-labelledby="collect-heading" className="mt-8 rounded-[16px] border border-border p-5">
          <h2 id="collect-heading" className="text-sm font-[650] text-muted">
            Collect from
          </h2>
          <p className="mt-1 font-[650]">{collectionBranchQuery.data.name}</p>
          <a
            href={mapsUrlFor(collectionBranchQuery.data.name, collectionBranchQuery.data.address)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-start gap-2 text-[15px] text-muted underline-offset-4 hover:underline"
          >
            <MapPin className="mt-0.5 size-4 shrink-0 text-basil" aria-hidden />
            <span>
              {collectionBranchQuery.data.address.line1}, {collectionBranchQuery.data.address.town},{' '}
              {collectionBranchQuery.data.address.eircode}
            </span>
          </a>
        </section>
      )}

      {/* Cancel — only while `placed`, matching the platform rule */}
      {order.status === 'placed' && (
        <section className="mt-8 rounded-[16px] border border-border p-5">
          {confirmingCancel ? (
            <div className="flex flex-col gap-3">
              <p className="text-[15px]">
                Cancel this order?{' '}
                {order.paymentMethod === 'card' && 'Your card will be refunded in full.'}
              </p>
              {cancelMutation.isError && (
                <p role="alert" className="text-[15px] font-[550] text-error">
                  {errorMessage(cancelMutation.error)}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmingCancel(false)}>
                  Keep my order
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  loading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(undefined)}
                >
                  Yes, cancel it
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] text-muted">
                Changed your mind? You can cancel until the kitchen accepts.
              </p>
              <Button variant="outline" onClick={() => setConfirmingCancel(true)}>
                Cancel order
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Order summary — snapshotted lines, always render correctly */}
      <section aria-labelledby="receipt-heading" className="mt-8">
        <h2 id="receipt-heading" className="display text-xl">
          The damage
        </h2>
        <ul className="mt-4 flex flex-col gap-2.5">
          {order.lines.map((line, index) => (
            <li key={index} className="flex items-baseline justify-between gap-3 text-[15px]">
              <span>
                {line.quantity} × {line.name}
                {line.modifiers && line.modifiers.length > 0 && (
                  <span className="block text-[13px] text-muted">
                    {line.modifiers.map((m) => m.name).join(' · ')}
                  </span>
                )}
              </span>
              <span className="tabular-nums">{formatCents(line.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatCents(order.subtotalCents)}</dd>
          </div>
          {order.deliveryFeeCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd className="tabular-nums">{formatCents(order.deliveryFeeCents)}</dd>
            </div>
          )}
          {order.serviceFeeCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Service fee</dt>
              <dd className="tabular-nums">{formatCents(order.serviceFeeCents)}</dd>
            </div>
          )}
          <div className="flex justify-between text-[13px]">
            <dt className="text-muted">Includes VAT</dt>
            <dd className="tabular-nums text-muted">{formatCents(order.vatTotalCents)}</dd>
          </div>
          <div className="mt-1 flex justify-between text-lg font-[750]">
            <dt>Total {order.paymentMethod === 'cash' ? '· cash' : ''}</dt>
            <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
          </div>
        </dl>
        {order.deliveryAddress && (
          <p className="mt-4 text-[15px] text-muted">
            Delivering to {order.deliveryAddress.line1}, {order.deliveryAddress.town},{' '}
            {order.deliveryAddress.eircode}
          </p>
        )}
        {order.note && (
          <p className="mt-2 text-[15px] text-muted">Note: “{order.note}”</p>
        )}
      </section>
    </main>
  )
}
