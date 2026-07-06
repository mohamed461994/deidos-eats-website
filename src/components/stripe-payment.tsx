/**
 * LIVE Stripe payment — Payment Element confirming the PaymentIntent that
 * POST /checkout created (immediate capture; Apple Pay / Google Pay appear
 * automatically in supported browsers via automatic_payment_methods).
 *
 * Only rendered in live mode; mock mode uses the clearly-marked fake pay
 * button in the checkout page. Untested against real Stripe until the
 * website has its own Cognito client + CORS (see implementation.md).
 */
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { config } from '@/config'
import { formatCents } from '@/lib/money'

let stripePromise: Promise<Stripe | null> | undefined

function getStripe() {
  stripePromise ??= loadStripe(config.stripePublishableKey)
  return stripePromise
}

interface StripePaymentProps {
  clientSecret: string
  amountCents: number
  /** Where Stripe redirects after confirmation (the order tracking page). */
  returnUrl: string
}

function PaymentForm({ amountCents, returnUrl }: { amountCents: number; returnUrl: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePay() {
    if (!stripe || !elements) return
    setPending(true)
    setError(null)
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    })
    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed. Try another card.')
      setPending(false)
    } else {
      // Success without a redirect-based method — go straight to tracking.
      window.location.assign(returnUrl)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement />
      {error && (
        <p role="alert" className="rounded-[10px] bg-error-tint px-4 py-3 text-[15px] font-[550] text-error">
          {error}
        </p>
      )}
      <Button size="lg" loading={pending} disabled={!stripe} onClick={() => void handlePay()}>
        Pay {formatCents(amountCents)}
      </Button>
    </div>
  )
}

export function StripePayment({ clientSecret, amountCents, returnUrl }: StripePaymentProps) {
  const options = useMemo(
    () => ({
      clientSecret,
      appearance: {
        variables: {
          colorPrimary: 'oklch(0.40 0.13 143)',
          borderRadius: '10px',
          fontFamily: "'Bricolage Grotesque Variable', system-ui, sans-serif",
        },
      },
    }),
    [clientSecret],
  )
  return (
    <Elements stripe={getStripe()} options={options}>
      <PaymentForm amountCents={amountCents} returnUrl={returnUrl} />
    </Elements>
  )
}
