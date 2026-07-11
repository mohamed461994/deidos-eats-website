import { TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { sameCounty } from '@/lib/distance'

interface CountyMismatchNoticeProps {
  /** County of the branch the cart is ordering from. */
  branchCounty: string | null | undefined
  /** County of the chosen delivery address. */
  addressCounty: string | null | undefined
  /** When another branch sits in the address's county, offer a one-tap switch. */
  suggestion?: { branchName: string; onSwitch: () => void }
}

/**
 * Warn-only banner shown at checkout when a delivery address's county differs
 * from the ordering branch's county. It is deliberately *not* a hard stop — the
 * server is the final authority on delivery range (see implementation.md §8) —
 * so it never disables "Place order". It just makes a likely wrong-branch
 * delivery impossible to miss, and offers the nearer branch when one fits.
 *
 * Presentational only: renders nothing when the counties match (normalized) or
 * either is unknown; the parent owns any cart-clearing/navigation.
 */
export function CountyMismatchNotice({
  branchCounty,
  addressCounty,
  suggestion,
}: CountyMismatchNoticeProps) {
  if (!branchCounty || !addressCounty || sameCounty(branchCounty, addressCounty)) return null

  return (
    <div role="alert" className="rounded-[16px] border border-warning/40 bg-crust-tint px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-warning" aria-hidden />
        <div className="flex flex-col gap-2">
          <p className="text-[15px]">
            Heads up — you're ordering delivery from a{' '}
            <strong className="font-[650]">{branchCounty}</strong> branch to a{' '}
            <strong className="font-[650]">{addressCounty}</strong> address. Double-check this
            branch delivers to you.
          </p>
          {suggestion && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={suggestion.onSwitch}
            >
              Switch to {suggestion.branchName}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
