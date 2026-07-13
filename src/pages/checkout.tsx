import { Bike, Clock, MapPin, ShoppingBag } from 'lucide-react'
import { lazy, Suspense, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { api, errorMessage, isRestaurantUnavailableError } from '@/api'
import { mockConfirmCardPayment, mockStartKitchenForCashOrder } from '@/api/mock/api'
import { useAddresses, useBranch, useBranchesDetails, useRestaurant } from '@/api/queries'
import type { Branch, CheckoutResponse, FulfillmentType, PricedCart } from '@/api/types'
import { useAuth } from '@/auth/context'
import { useCart } from '@/cart/context'
import { AddressForm } from '@/components/address-form'
import { BranchPickerDialog } from '@/components/branch-picker'
import { CountyMismatchNotice } from '@/components/county-mismatch-notice'
import { EmptyState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TextAreaField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { isMock } from '@/config'
import { useRememberedBranch } from '@/lib/branch-selection'
import { sameCounty } from '@/lib/distance'
import { newIdempotencyKey } from '@/lib/idempotency'
import { mapsUrlFor } from '@/lib/maps'
import { formatCents, formatVatRate } from '@/lib/money'
import { paths } from '@/lib/routes'
import { cn } from '@/lib/utils'

const StripePayment = lazy(() =>
  import('@/components/stripe-payment').then((m) => ({ default: m.StripePayment })),
)

type PaymentMethod = 'card' | 'cash'

export function CheckoutPage() {
  const { status } = useAuth()
  const { cart, lineInputs, clearCart, itemCount } = useCart()
  const { toast } = useToast()
  const navigate = useNavigate()
  const branchQuery = useBranch(cart.branchId)
  const branch = branchQuery.data
  const addressesQuery = useAddresses()
  // Identity is the CART's restaurant — never "the last restaurant browsed".
  // This is the N=2 fix: the county-mismatch suggestion and the branch picker
  // below must iterate THIS restaurant's branches, not a globally-pinned one.
  const restaurantQuery = useRestaurant(cart.restaurantId)
  const restaurantSlug = restaurantQuery.data?.slug ?? cart.restaurantSlug
  const [, rememberBranch] = useRememberedBranch(cart.restaurantId)
  const [unavailable, setUnavailable] = useState(false)

  // User choices layered over sensible defaults — derived, never synced via effects
  const [fulfillmentChoice, setFulfillmentChoice] = useState<FulfillmentType | null>(null)
  const fulfillment: FulfillmentType | null =
    fulfillmentChoice ??
    (branch ? (branch.fulfillment.collectionEnabled ? 'collection' : 'delivery') : null)

  const [addressChoice, setAddressChoice] = useState<string | null>(null)
  const defaultAddress = addressesQuery.data?.find((a) => a.isDefault) ?? addressesQuery.data?.[0]
  const addressId = addressChoice ?? defaultAddress?.id ?? null
  const selectedAddress = addressesQuery.data?.find((a) => a.id === addressId)
  const addressCounty = selectedAddress?.county ?? null

  // Branch switching (move-order): the picker in checkout clears the cart on a
  // real branch change. `switchTarget` opens it straight on the confirm step so
  // a county-mismatch suggestion is a genuine one-tap switch.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [switchTarget, setSwitchTarget] = useState<Branch | null>(null)

  // Look up the *other* branches only when a delivery county could mismatch, so
  // we can suggest one that actually sits in the delivery address's county.
  const otherBranchIds = (restaurantQuery.data?.branches ?? [])
    .map((b) => b.id)
    .filter((id) => id !== cart.branchId)
  const suggestionIds = fulfillment === 'delivery' && addressCounty ? otherBranchIds : []
  const otherBranches = useBranchesDetails(suggestionIds)
  const suggestionBranch = otherBranches.find(
    (q) => q.data && sameCounty(q.data.address.county, addressCounty),
  )?.data

  const [addingAddress, setAddingAddress] = useState(false)
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')

  const [pricing, setPricing] = useState(false)
  // A quote is only valid for the exact inputs it priced — anything changes, it expires
  const [quote, setQuote] = useState<{ cart: PricedCart; signature: string } | null>(null)
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState<CheckoutResponse | null>(null)
  // The quote total the buyer saw when they hit "place" — if checkout itself
  // reprices above it (a promo expired in the gap), the payment step says so.
  const [placedQuotedTotal, setPlacedQuotedTotal] = useState<number | null>(null)
  const [payingMock, setPayingMock] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quoteSignature = JSON.stringify({ lineInputs, fulfillment, addressId, paymentMethod })
  const priced = quote && quote.signature === quoteSignature ? quote.cart : null

  // Promo honesty (plan §8): if the kitchen's quote prices the items ABOVE what
  // the basket displayed (a promo expired between adding and reviewing), the
  // buyer must explicitly accept the new total before the order can be placed —
  // we never silently charge more than we showed. Acceptance is pinned to the
  // exact quote (inputs + total); any change re-requires it.
  const displayedSubtotalCents = cart.lines.reduce(
    (sum, l) => sum + l.unitPriceCents * l.quantity,
    0,
  )
  const [acceptedQuoteKey, setAcceptedQuoteKey] = useState<string | null>(null)
  const repricedUp = priced !== null && priced.subtotalCents > displayedSubtotalCents
  const quoteKey = priced ? `${quoteSignature}|${priced.totalCents}` : null
  const needsPriceConfirm = repricedUp && acceptedQuoteKey !== quoteKey

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
    return <Navigate to={paths.signIn(paths.checkout())} replace />
  }
  if (itemCount === 0 && !placed) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <EmptyState
          title="Nothing to check out"
          body="Your basket is empty — pick a restaurant and we'll get the ovens going."
          action={<Button onClick={() => navigate(paths.discovery())}>Browse restaurants</Button>}
        />
      </main>
    )
  }
  // The restaurant stopped taking orders mid-checkout (server-authoritative).
  if (unavailable) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <EmptyState
          title={`${cart.restaurantName ?? 'This restaurant'} isn't taking orders`}
          body="They paused new orders while you were checking out. Your basket is saved — try again shortly, or browse other restaurants."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {restaurantSlug && (
                <Button variant="outline" onClick={() => navigate(paths.restaurant(restaurantSlug))}>
                  Back to {cart.restaurantName ?? 'restaurant'}
                </Button>
              )}
              <Button onClick={() => navigate(paths.discovery())}>Browse restaurants</Button>
            </div>
          }
        />
      </main>
    )
  }
  // Untrusted-cache guard (plan §6.2.5): the persisted restaurant id must match
  // the AUTHORITATIVE branch. A mismatch means stale cart identity — block with a
  // recovery path rather than checking out against the wrong restaurant.
  if (branch && cart.restaurantId && branch.restaurantId !== cart.restaurantId) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <EmptyState
          title="We couldn't confirm your basket"
          body="Your saved basket doesn't line up with this restaurant anymore. Clear it and start fresh to keep your order accurate."
          action={
            <Button
              onClick={() => {
                clearCart()
                navigate(paths.discovery())
              }}
            >
              Clear basket &amp; browse
            </Button>
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
      // Restaurant went paused/unavailable between browse and here — explain it
      // specifically rather than as a generic validation error (plan §6.2.9).
      if (isRestaurantUnavailableError(err)) setUnavailable(true)
      else setError(errorMessage(err))
    } finally {
      setPricing(false)
    }
  }

  async function handlePlaceOrder() {
    if (!cart.branchId || !fulfillment) return
    setPlacing(true)
    setError(null)
    const quotedTotal = priced?.totalCents ?? null
    setPlacedQuotedTotal(quotedTotal)
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
        // A cash order is committed the moment it lands; if checkout repriced
        // above the confirmed quote in that gap, say so immediately — the
        // buyer can still cancel until the kitchen accepts.
        if (quotedTotal !== null && response.amountCents > quotedTotal) {
          toast(
            `Your total changed to ${formatCents(response.amountCents)} because an offer ended — you can cancel until the kitchen accepts.`,
            'error',
          )
        }
        navigate(paths.order(response.orderId), { replace: true })
      }
    } catch (err) {
      if (isRestaurantUnavailableError(err)) setUnavailable(true)
      else setError(errorMessage(err))
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
      navigate(paths.order(placed.orderId), { replace: true })
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
          {/* Promo honesty: checkout repriced above the quote the buyer accepted
              (an offer ended in the gap). Nothing is charged until they pay. */}
          {placedQuotedTotal != null && placed.amountCents > placedQuotedTotal && (
            <p
              role="alert"
              className="rounded-[16px] border border-warning/40 bg-crust-tint px-4 py-3.5 text-[15px]"
            >
              Your total changed from{' '}
              <s className="tabular-nums">{formatCents(placedQuotedTotal)}</s> to{' '}
              <strong className="tabular-nums font-[750]">{formatCents(placed.amountCents)}</strong>{' '}
              because an offer ended. Nothing is charged until you pay — only continue if
              you're happy with the new total.
            </p>
          )}
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
          {/* Branch — the money-moment guardrail: which branch, full address,
              and one tap to change it (which clears the cart). */}
          {branch && (
            <section
              aria-labelledby="branch-heading"
              className="rounded-[16px] border border-border p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 id="branch-heading" className="text-sm font-[650] text-muted">
                    {fulfillment === 'collection' ? "You'll collect from here" : 'Ordering from'}
                  </h2>
                  {cart.restaurantName && (
                    <p className="text-[13px] font-[650] text-basil">{cart.restaurantName}</p>
                  )}
                  <p className="display text-xl">{branch.name}</p>
                </div>
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
              <a
                href={mapsUrlFor(branch.name, branch.address)}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'mt-3 flex items-start gap-2 text-[15px] underline-offset-4 hover:underline',
                  fulfillment === 'collection' ? 'font-[550] text-ink' : 'text-muted',
                )}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-basil" aria-hidden />
                <span>
                  {branch.address.line1}
                  {branch.address.line2 ? `, ${branch.address.line2}` : ''}, {branch.address.town},{' '}
                  {branch.address.eircode}
                </span>
              </a>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSwitchTarget(null)
                    setPickerOpen(true)
                  }}
                >
                  Change branch
                </Button>
                <Link
                  to="/menu"
                  className="text-[15px] text-basil underline-offset-4 hover:underline"
                >
                  Edit your cart
                </Link>
              </div>
            </section>
          )}

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
              {/* Warn-only: address in a different county than the branch. Never
                  blocks placing the order — the server decides delivery range. */}
              <div className="mt-3 empty:hidden">
                <CountyMismatchNotice
                  branchCounty={branch?.address.county}
                  addressCounty={addressCounty}
                  suggestion={
                    suggestionBranch
                      ? {
                          branchName: suggestionBranch.name,
                          onSwitch: () => {
                            setSwitchTarget(suggestionBranch)
                            setPickerOpen(true)
                          },
                        }
                      : undefined
                  }
                />
              </div>
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
                {priced.lines.map((line, index) => {
                  // The basket line this priced line answers (same order as
                  // lineInputs) — lets the summary say "was €x" when the
                  // kitchen priced a line above what the basket displayed.
                  const basketLine = cart.lines[index]
                  const basketLineTotal =
                    basketLine && basketLine.menuItemId === line.menuItemId
                      ? basketLine.unitPriceCents * basketLine.quantity
                      : null
                  return (
                    <li
                      key={index}
                      className="flex items-baseline justify-between gap-3 text-[15px]"
                    >
                      <span>
                        {line.quantity} × {line.name}
                        {line.modifiers && line.modifiers.length > 0 && (
                          <span className="block text-[13px] text-muted">
                            {line.modifiers.map((m) => m.name).join(' · ')}
                          </span>
                        )}
                        {line.discountSource === 'online_promo' &&
                          line.originalUnitPriceCents != null && (
                            <span className="block text-[13px] text-basil">
                              Online offer — was{' '}
                              <s className="tabular-nums">
                                {formatCents(line.originalUnitPriceCents * line.quantity)}
                              </s>
                            </span>
                          )}
                      </span>
                      <span className="tabular-nums">
                        {basketLineTotal != null && line.lineTotalCents > basketLineTotal && (
                          <s aria-hidden className="mr-1.5 text-[13px] text-muted">
                            {formatCents(basketLineTotal)}
                          </s>
                        )}
                        {formatCents(line.lineTotalCents)}
                      </span>
                    </li>
                  )
                })}
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

          {/* Visible repricing (plan §8): the quote is ABOVE what the basket
              displayed — say so plainly and require an explicit accept before
              the order can be placed. Never silently charge more than shown. */}
          {priced && repricedUp && (
            <div
              role="alert"
              className="rounded-[16px] border border-warning/40 bg-crust-tint px-4 py-3.5 text-[15px]"
            >
              <p className="font-[650]">The kitchen's prices changed</p>
              <p className="mt-1">
                An online offer ended while you were ordering. Your items now come to{' '}
                <strong className="tabular-nums font-[750]">
                  {formatCents(priced.subtotalCents)}
                </strong>{' '}
                — your basket showed{' '}
                <s className="tabular-nums">{formatCents(displayedSubtotalCents)}</s>. Accept
                the new total below, or edit your cart.
              </p>
            </div>
          )}

          {priced ? (
            needsPriceConfirm ? (
              <Button size="lg" onClick={() => setAcceptedQuoteKey(quoteKey)}>
                Accept new total · {formatCents(priced.totalCents)}
              </Button>
            ) : (
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
            )
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

      <BranchPickerDialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open)
          if (!open) setSwitchTarget(null)
        }}
        branches={restaurantQuery.data?.branches ?? []}
        selectedId={cart.branchId}
        mode="moveOrder"
        initialTarget={switchTarget}
        title={restaurantQuery.data ? `Choose a ${restaurantQuery.data.name} location` : 'Choose a location'}
        onSelected={(b) => {
          // The dialog has already cleared the cart if this was a real switch.
          rememberBranch(b.id)
          if (restaurantSlug) navigate(paths.restaurantMenu(restaurantSlug, b.id))
        }}
      />
    </main>
  )
}
