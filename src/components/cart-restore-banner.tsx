import { RotateCw } from 'lucide-react'

import { useCart } from '@/cart/context'
import { Button } from '@/components/ui/button'

/**
 * Recoverable "basket restore pending" state (plan §6.2.5). When the v1→v2 cart
 * migration can't complete — offline, the old branch/restaurant is gone, or
 * storage is blocked — the legacy basket is preserved untouched and this slim
 * bar offers Retry / Start fresh. It never silently drops the basket, and it's
 * shown app-wide (not just in the cart drawer) because the cart reads empty
 * until the restore succeeds.
 */
export function CartRestoreBanner() {
  const { migrationStatus, retryRestore, discardRestore } = useCart()
  if (migrationStatus !== 'restore_pending') return null

  return (
    <div
      role="status"
      className="border-b border-warning/40 bg-crust-tint"
      style={{ zIndex: 'calc(var(--z-sticky) - 1)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <p className="flex-1 text-[15px] font-[550] text-ink">
          We couldn't restore your saved basket just yet — your items are safe. Retry, or start fresh.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={retryRestore}>
            <RotateCw className="size-4" aria-hidden />
            Retry
          </Button>
          <Button size="sm" variant="ghost" onClick={discardRestore}>
            Start fresh
          </Button>
        </div>
      </div>
    </div>
  )
}
