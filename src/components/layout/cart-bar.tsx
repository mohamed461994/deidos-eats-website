import { useLocation } from 'react-router-dom'

import { useCart } from '@/cart/context'
import { formatCents } from '@/lib/money'

/**
 * Mobile one-thumb cart access: sticky bottom bar, safe-area aware.
 * Hidden on checkout/tracking (the flow owns the bottom of the screen there).
 */
export function MobileCartBar() {
  const { cart, itemCount, subtotalCents, openCart } = useCart()
  const { pathname } = useLocation()

  const hidden =
    itemCount === 0 || pathname.startsWith('/checkout') || pathname.startsWith('/orders/')
  if (hidden) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 p-3 sm:hidden"
      style={{
        zIndex: 'var(--z-sticky)',
        paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
      }}
    >
      <button
        type="button"
        onClick={openCart}
        className="flex h-14 w-full items-center justify-between rounded-full bg-basil px-6 text-on-basil shadow-floating transition-colors active:bg-basil-deep"
      >
        <span className="flex min-w-0 items-center gap-2 font-[650]">
          <span aria-hidden className="ember-dot shrink-0" />
          <span className="truncate">
            {cart.restaurantName ? `${cart.restaurantName} basket` : 'View basket'}
          </span>
        </span>
        <span className="tabular-nums font-[650]">
          {itemCount} · {formatCents(subtotalCents)}
        </span>
      </button>
    </div>
  )
}
