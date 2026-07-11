import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useCart } from '@/cart/context'
import { FoodImage } from '@/components/food-image'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { QuantityStepper } from '@/components/ui/quantity'
import { formatCents } from '@/lib/money'

export function CartDrawer() {
  const { cart, isOpen, closeCart, setQuantity, removeLine, subtotalCents, itemCount } = useCart()
  const navigate = useNavigate()

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && closeCart()} title="Your cart" shape="drawer">
      {itemCount === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-10 text-center">
          <p className="display text-xl">The oven’s ready when you are</p>
          <p className="max-w-60 text-[15px] text-muted">
            Your cart is empty. Fix that — the menu’s one tap away.
          </p>
          <Button
            className="mt-2"
            onClick={() => {
              closeCart()
              navigate('/menu')
            }}
          >
            Browse the menu
          </Button>
        </div>
      ) : (
        <>
          <p className="px-6 text-[13px] font-[550] text-muted">
            From {cart.restaurantName}
            {cart.branchName ? ` · ${cart.branchName}` : ''}
          </p>
          <ul className="flex-1 divide-y divide-border/70 overflow-y-auto px-6 py-3">
            {cart.lines.map((line) => (
              <li key={line.key} className="flex gap-3 py-4">
                <FoodImage
                  src={line.imageUrl}
                  alt=""
                  fallbackLabel={line.name}
                  className="size-16 shrink-0 rounded-[10px]"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-[650]">{line.name}</p>
                    <p className="tabular-nums shrink-0 font-[650]">
                      {formatCents(line.unitPriceCents * line.quantity)}
                    </p>
                  </div>
                  {line.modifiers.length > 0 && (
                    <p className="text-[13px] text-muted">
                      {line.modifiers.map((m) => m.name).join(' · ')}
                    </p>
                  )}
                  <div className="mt-1 flex items-center justify-between">
                    <QuantityStepper
                      size="sm"
                      value={line.quantity}
                      onChange={(q) => setQuantity(line.key, q)}
                      min={0}
                      label={line.name}
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      aria-label={`Remove ${line.name} from cart`}
                      className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-error-tint hover:text-error"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border bg-bg px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-1 flex items-baseline justify-between">
              <p className="font-[550]">Subtotal</p>
              <p className="tabular-nums text-lg font-[750]">{formatCents(subtotalCents)}</p>
            </div>
            <p className="mb-4 text-[13px] text-muted">
              VAT included. Delivery fee (if any) is added at checkout.
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                closeCart()
                navigate('/checkout')
              }}
            >
              Go to checkout
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
