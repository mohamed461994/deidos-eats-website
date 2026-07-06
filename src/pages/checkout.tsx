import { Bike, ShoppingBag } from 'lucide-react'
import { lazy, Suspense, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { api, errorMessage } from '@/api'
import { mockConfirmCardPayment, mockStartKitchenForCashOrder } from '@/api/mock/api'
import { useAddresses, useBranch } from '@/api/queries'
import type { CheckoutResponse, FulfillmentType, PricedCart } from '@/api/types'
import { useAuth } from '@/auth/context'
import { useCart } from '@/cart/context'
import { AddressForm } from '@/components/address-form'
import { EmptyState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TextAreaField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { isMock } from '@/config'
import { newIdempotencyKey } from '@/lib/idempotency'
import { formatCents, formatVatRate } from '@/lib/money'
import { cn } from '@/lib/utils'

const StripePayment = lazy(() =>
  import('@/components/stripe-payment').then((m) => ({ default: m.StripePayment })),
)

type PaymentMethod = 'card' | 'cash'

export function CheckoutPage() {
  const { status } = useAuth()
  const { cart, lineInputs, clearCart, itemCount } = useCart()
  const navigate = useNavigate()
  const branchQuery = useBranch(cart.branchId)
  const branch = branchQuery.data
  const addressesQuery = useAddresses()

  // User choices layered over sensible defaults — derived, never synced via effects
  const [fulfillmentChoice, setFulfillmentChoice] = useState<FulfillmentType | null>(null)
  const fulfillment: FulfillmentType | null =
    fulfillmentChoice ??
    (branch ? (branch.fulfillment.collectionEnabled ? 'collection' : 'delivery') : null)

  const [addressChoice, setAddressChoice] = useState<string | null>(null)
  const defaultAddress = addressesQuery.data?.find((a) => a.isDefault) ?? addressesQuery.data?.[0]
  const addressId = addressChoice ?? defaultAddress?.id ?? null

  const [addingAddress, setAddingAddress] = useState(false)
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')

  const [pricing, setPricing] = useState(false)
  // A quote is only valid for the exact inputs it priced — anything changes, it expires
  const [quote, setQuote] = useState<{ cart: PricedCart; signature: string } | null>(null)
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState<CheckoutResponse | null>(null)
  const [payingMock, setPayingMock] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quoteSignature = JSON.stringify({ lineInputs, fulfillment, addressId, paymentMethod })
  const priced = quote && quote.signature === quoteSignature ? quote.cart : null

  // One idempotency key per checkout attempt-set: retries resume, not duplicate.
  const idempotencyKey = useRef(newIdempotencyKey())

  if (status === 'restoring') {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="mt-6 h-40 w-full" />
      </main>
    )
  }
  if (status === 'signedOut') {
    return <Navigate to="/signin?next=/checkout" replace />
  }
  if (itemCount === 0 && !placed) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <EmptyState
          title="Nothing to check out"
          body="Your cart is empty — the ovens are ready when you are."
          action={
            <Button onClick={() => navigate('/menu')}>Browse the menu</Button>
          }
        />
      </main>
    )
  }

  const needsAddress = fulfillment === 'delivery'
  const belowMinimum =
    needsAddress &&
    branch?.fulfillment.minOrderCents != null &&
    cart.lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0) <
      branch.fulfillment.minOrderCents

  async function handleReview() {
    if (!cart.branchId || !fulfillment) return
    setPricing(true)
    setError(null)
    try {
      const result = await api.validateCart(cart.branchId, {
        fulfillmentType: fulfillment,
        ...(needsAddress && addressId ? { addressId } : {}),
        lines: lineInputs,
      })
      setQuote({ cart: result, signature: quoteSignature })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPricing(false)
    }
  }

  async function handlePlaceOrder() {
    if (!cart.branchId || !fulfillment) return
    setPlacing(true)
    setError(null)
    try {
      const response = await api.checkout(
        {
          branchId: cart.branchId,
          fulfillmentType: fulfillment,
          ...(needsAddress && addressId ? { addressId } : {}),
          lines: lineInputs,
          paymentMethod,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        idempotencyKey.current,
      )
      setPlaced(response)
      if (response.paymentMethod === 'cash') {
        if (isMock) mockStartKitchenForCashOrder(response.orderId)
        clearCart()
        navigate(`/orders/${response.orderId}`, { replace: true })
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPlacing(false)
    }
  }

  async function handleMockPay() {
    if (!placed) return
    setPayingMock(true)
    try {
      await mockConfirmCardPayment(placed.orderId)
      clearCart()
      navigate(`/orders/${placed.orderId}`, { replace: true })
    } finally {
      setPayingMock(false)
    }
  }

  const choiceClasses = (selected: boolean) =>
    cn(
      'flex flex-1 items-center justify-center gap-2 rounded-[16px] border px-4 py-3.5 font-[550] transition-colors',
      selected
        ? 'border-basil bg-basil-tint text-basil-deep'
        : 'border-border text-ink hover:bg-surface',
    )

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 sm:px-6">
      <header className="pt-10 pb-6">
        <h1 className="display text-[clamp(2rem,4.5vw,3rem)]">Checkout</h1>
        {branch && (
          <p className="mt-2 text-muted">
            From <strong className="text-ink">{branch.name}</strong> ·{' '}
            <Link to="/menu" className="text-basil underline-offset-4 hover:underline">
              edit your cart
            </Link>
          </p>
        )}
      </header>

      {placed && placed.paymentMethod === 'card' ? (
        /* ---- Payment step ------------------------------------------------ */
        <section aria-labelledby="pay-heading" className="flex flex-col gap-5">
          <h2 id="pay-heading" className="display text-xl">
            Pay {formatCents(placed.amountCents)}
          </h2>
          <p className="text-[15px] text-muted">
            Your order is reserved with the kitchen and confirms the moment payment goes
            through.
          </p>
          {isMock ? (
            <div className="flex flex-col gap-4 rounded-[16px] border border-border p-5">
              <Badge variant="ember-soft" className="self-start">
                Demo payment — no real Stripe
              </Badge>
              <p className="text-[15px] text-muted">
                In live mode this is the Stripe Payment Element (card, Apple Pay, Google
                Pay). Demo mode simulates a successful card payment.
              </p>
              <Button size="lg" loading={payingMock} onClick={() => void handleMockPay()}>
                Pay {formatCents(placed.amountCents)} (demo)
              </Button>
            </div>
          ) : (
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <StripePayment
                clientSecret={placed.paymentIntentClientSecret ?? ''}
                amountCents={placed.amountCents}
                returnUrl={`${window.location.origin}/orders/${placed.orderId}`}
              />
            </Suspense>
          )}
        </section>
      ) : (
        /* ---- Build step --------------------------------------------------- */
        <div className="flex flex-col gap-8">
          {/* Fulfillment */}
          <section aria-labelledby="fulfillment-heading">
            <h2 id="fulfillment-heading" className="mb-3 text-sm font-[650] text-muted">
              How are we getting this to you?
            </h2>
            <div className="flex gap-3">
              {branch?.fulfillment.collectionEnabled && (
                <button
                  type="button"
                  className={choiceClasses(fulfillment === 'collection')}
                  aria-pressed={fulfillment === 'collection'}
                  onClick={() => {
                    setFulfillmentChoice('collection')
                    setError(null)
                  }}
                >
                  <ShoppingBag className="size-4.5" aria-hidden />
                  Collection
                </button>
              )}
              {branch?.fulfillment.deliveryEnabled && (
                <button
                  type="button"
                  className={choiceClasses(fulfillment === 'delivery')}
                  aria-pressed={fulfillment === 'delivery'}
                  onClick={() => {
                    setFulfillmentChoice('delivery')
                    setError(null)
                  }}
                >
                  <Bike className="size-4.5" aria-hidden />
                  Delivery
                  {branch.fulfillment.deliveryFeeCents != null && (
                    <span className="text-[13px] font-[450] text-muted">
                      from {formatCents(branch.fulfillment.deliveryFeeCents)}
                    </span>
                  )}
                </button>
              )}
            </div>
            {belowMinimum && branch?.fulfillment.minOrderCents != null && (
              <p role="status" className="mt-3 rounded-[10px] bg-crust-tint px-4 py-3 text-[15px]">
                Delivery needs a {formatCents(branch.fulfillment.minOrderCents)} minimum —
                add {formatCents(branch.fulfillment.minOrderCents - cart.lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0))}{' '}
                more, or switch to collection.
              </p>
            )}
          </section>

          {/* Delivery address */}
          {needsAddress && (
            <section aria-labelledby="address-heading">
              <h2 id="address-heading" className="mb-3 text-sm font-[650] text-muted">
                Deliver to
              </h2>
              {addressesQuery.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : addingAddress || (addressesQuery.data ?? []).length === 0 ? (
                <AddressForm
                  onSaved={(address) => {
                    setAddressChoice(address.id)
                    setAddingAddress(false)
                    void addressesQuery.refetch()
                  }}
                  onCancel={
                    (addressesQuery.data ?? []).length > 0
                      ? () => setAddingAddress(false)
                      : undefined
                  }
                />
              ) : (
                <div className="flex flex-col gap-2" role="radiogroup" aria-label="Delivery address">
                  {(addressesQuery.data ?? []).map((address) => {
                    const selected = address.id === addressId
                    return (
                      <button
                        key={address.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setAddressChoice(address.id)
                          setError(null)
                        }}
                        className={cn(
                          'rounded-[16px] border px-4 py-3 text-left transition-colors',
                          selected
                            ? 'border-basil bg-basil-tint'
                            : 'border-border hover:bg-surface',
                        )}
                      >
                        <p className="font-[650]">
                          {address.label ?? address.line1}
                          {address.isDefault && (
                            <span className="ml-2 text-[13px] font-[450] text-muted">Default</span>
                          )}
                        </p>
                        <p className="text-[15px] text-muted">
                          {address.line1}, {address.town}, {address.eircode}
                        </p>
                      </button>
                    )
                  })}
                  <Button variant="ghost" className="self-start" onClick={() => setAddingAddress(true)}>
                    + Add another address
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* Note */}
          <section>
            <TextAreaField
              label="Note for the kitchen (optional)"
              placeholder="Ring the bell, extra napkins…"
              maxLength={280}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </section>

          {/* Payment method */}
          <section aria-labelledby="payment-heading">
            <h2 id="payment-heading" className="mb-3 text-sm font-[650] text-muted">
              Paying with
            </h2>
            <div className="flex gap-3">
              <button
                type="button"
                className={choiceClasses(paymentMethod === 'card')}
                aria-pressed={paymentMethod === 'card'}
                onClick={() => {
                  setPaymentMethod('card')
                  setError(null)
                }}
              >
                Card / Apple Pay
              </button>
              {branch?.payment.cashEnabled && (
                <button
                  type="button"
                  className={choiceClasses(paymentMethod === 'cash')}
                  aria-pressed={paymentMethod === 'cash'}
                  onClick={() => {
                    setPaymentMethod('cash')
                    setError(null)
                  }}
                >
                  Cash on {fulfillment === 'delivery' ? 'delivery' : 'collection'}
                </button>
              )}
            </div>
          </section>

          {/* Price breakdown (server-priced) */}
          {priced && (
            <section
              aria-labelledby="summary-heading"
              className="rounded-[16px] border border-border p-5"
            >
              <h2 id="summary-heading" className="mb-3 text-sm font-[650] text-muted">
                Your order, priced by the kitchen
              </h2>
              <ul className="flex flex-col gap-2">
                {priced.lines.map((line, index) => (
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
                  <dd className="tabular-nums">{formatCents(priced.subtotalCents)}</dd>
                </div>
                {priced.deliveryFeeCents > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">Delivery</dt>
                    <dd className="tabular-nums">{formatCents(priced.deliveryFeeCents)}</dd>
                  </div>
                )}
                {priced.serviceFeeCents > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">Service fee</dt>
                    <dd className="tabular-nums">{formatCents(priced.serviceFeeCents)}</dd>
                  </div>
                )}
                {priced.vatBreakdown.map((band) => (
                  <div key={band.rateBasisPoints} className="flex justify-between text-[13px]">
                    <dt className="text-muted">Includes VAT ({formatVatRate(band.rateBasisPoints)})</dt>
                    <dd className="tabular-nums text-muted">{formatCents(band.vatCents)}</dd>
                  </div>
                ))}
                <div className="mt-1 flex justify-between text-lg font-[750]">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatCents(priced.totalCents)}</dd>
                </div>
              </dl>
            </section>
          )}

          {error && (
            <p role="alert" className="rounded-[10px] bg-error-tint px-4 py-3 text-[15px] font-[550] text-error">
              {error}
            </p>
          )}

          {priced ? (
            <Button
              size="lg"
              loading={placing}
              onClick={() => void handlePlaceOrder()}
              disabled={needsAddress && !addressId}
            >
              {paymentMethod === 'cash'
                ? `Place order · pay ${formatCents(priced.totalCents)} in cash`
                : `Continue to payment · ${formatCents(priced.totalCents)}`}
            </Button>
          ) : (
            <Button
              size="lg"
              loading={pricing}
              onClick={() => void handleReview()}
              disabled={!fulfillment || (needsAddress && !addressId) || !!belowMinimum}
            >
              Review order
            </Button>
          )}
        </div>
      )}
    </main>
  )
}
