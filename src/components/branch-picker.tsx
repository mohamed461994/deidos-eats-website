/**
 * Branch selection — one place, two faces, so a customer always knows which
 * branch they're ordering from and can change it in one tap:
 *
 * - `BranchChooser`: the cards themselves (used inline as the menu gate).
 * - `BranchPickerDialog`: the same cards inside a modal (header chip, checkout).
 *
 * Selecting a branch only ever sets the *browsing* branch — it never touches the
 * cart — except in `moveOrder` mode (checkout), where switching to a different
 * branch first confirms and clears the cart, because a cart is one branch only.
 */
import { Bike, Clock, LocateFixed, MapPin, ShoppingBag } from 'lucide-react'
import { useState } from 'react'

import { useBranchesDetails } from '@/api/queries'
import type { Branch, BranchSummary } from '@/api/types'
import { useCart } from '@/cart/context'
import { FoodImage } from '@/components/food-image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatKm, haversineKm } from '@/lib/distance'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

type Coords = { latitude: number; longitude: number }

interface BranchChooserProps {
  branches: BranchSummary[]
  /** The currently effective branch id, marked "Current" in the list. */
  selectedId?: string | null
  onSelect: (branch: Branch) => void
}

/** The card grid. Fetches each branch's full detail (cached, shared with useBranch). */
export function BranchChooser({ branches, selectedId, onSelect }: BranchChooserProps) {
  const details = useBranchesDetails(branches.map((b) => b.id))
  const [coords, setCoords] = useState<Coords | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoNote, setGeoNote] = useState<string | null>(null)

  // Pair each summary with its detail query and (once we know where the user is)
  // its distance. Distance needs the branch's coordinates, which live on the
  // full detail, so it stays null until that detail loads.
  const entries = branches.map((summary, i) => {
    const query = details[i]
    const detail = query?.data
    const distanceKm =
      coords && detail?.address.latitude != null && detail.address.longitude != null
        ? haversineKm(coords, {
            latitude: detail.address.latitude,
            longitude: detail.address.longitude,
          })
        : null
    return { summary, isError: query?.isError ?? false, detail, distanceKm }
  })

  // With a location, sort nearest-first (unknown distances sink to the bottom).
  const ordered =
    coords != null
      ? [...entries].sort((a, b) => {
          if (a.distanceKm == null) return 1
          if (b.distanceKm == null) return -1
          return a.distanceKm - b.distanceKm
        })
      : entries

  const nearestId =
    coords != null && ordered[0]?.distanceKm != null ? ordered[0].summary.id : null

  function requestLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoNote("Location isn't available on this device — just pick a branch below.")
      return
    }
    setLocating(true)
    setGeoNote(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Never logged or persisted — used only to sort this list in memory.
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setLocating(false)
      },
      () => {
        setLocating(false)
        setGeoNote("Couldn't get your location — no worries, pick a branch below.")
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="outline" size="sm" loading={locating} onClick={requestLocation}>
          <LocateFixed className="size-4" aria-hidden />
          Use my location
        </Button>
        {geoNote && (
          <p role="status" className="mt-2 text-[13px] text-muted">
            {geoNote}
          </p>
        )}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {ordered.map((entry) => (
          <li key={entry.summary.id}>
            <BranchOption
              summary={entry.summary}
              detail={entry.detail}
              isError={entry.isError}
              distanceKm={entry.distanceKm}
              isNearest={entry.summary.id === nearestId}
              isCurrent={entry.summary.id === selectedId}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

interface BranchOptionProps {
  summary: BranchSummary
  detail: Branch | undefined
  isError: boolean
  distanceKm: number | null
  isNearest: boolean
  isCurrent: boolean
  onSelect: (branch: Branch) => void
}

function BranchOption({
  summary,
  detail,
  isError,
  distanceKm,
  isNearest,
  isCurrent,
  onSelect,
}: BranchOptionProps) {
  if (isError) {
    return (
      <div className="rounded-[20px] border border-border p-5">
        <h3 className="display text-xl">{summary.name}</h3>
        <p className="mt-2 text-[15px] text-muted">Couldn't load this branch right now.</p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="overflow-hidden rounded-[20px] border border-border">
        <Skeleton className="aspect-[16/9] w-full rounded-none" />
        <div className="flex flex-col gap-3 p-5">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    )
  }

  const f = detail.fulfillment
  // Delivery sub-line, mirroring the locations card: "from €2.90 · min €15.00 · up to 5 km".
  const deliveryDetail = [
    f.deliveryFeeCents != null ? `from ${formatCents(f.deliveryFeeCents)}` : null,
    f.minOrderCents != null ? `min ${formatCents(f.minOrderCents)}` : null,
    f.deliveryRadiusKm != null ? `up to ${f.deliveryRadiusKm} km` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-[20px] border bg-bg',
        isCurrent ? 'border-basil ring-1 ring-basil' : 'border-border',
      )}
    >
      <FoodImage
        src={detail.imageUrl ?? null}
        alt={`Food at ${detail.name}`}
        className="aspect-[16/9] w-full"
      />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="display text-xl">{detail.name}</h3>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {isNearest && <Badge variant="basil-soft">Nearest</Badge>}
            {isCurrent && <Badge variant="neutral">Current</Badge>}
          </div>
        </div>

        <p className="flex items-center gap-1.5 text-[15px] text-muted">
          <MapPin className="size-4 shrink-0 text-basil" aria-hidden />
          {detail.address.town}
          {detail.address.county ? ` · ${detail.address.county}` : ''}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span
            className={cn(
              'flex items-center gap-1.5 font-[650]',
              detail.isOpen ? 'text-basil' : 'text-muted',
            )}
          >
            <Clock className="size-4" aria-hidden />
            {detail.isOpen ? 'Open now' : 'Closed'}
          </span>
          {distanceKm != null && (
            <span className="tabular-nums text-muted">{formatKm(distanceKm)} away</span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
          {f.collectionEnabled && (
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="size-4 text-basil" aria-hidden />
              Collection
            </span>
          )}
          {f.deliveryEnabled && (
            <span className="flex items-center gap-1.5">
              <Bike className="size-4 text-basil" aria-hidden />
              Delivery
              {deliveryDetail && <span className="text-muted">{deliveryDetail}</span>}
            </span>
          )}
        </div>

        <Button className="mt-auto self-start" onClick={() => onSelect(detail)}>
          Order here
        </Button>
      </div>
    </article>
  )
}

interface BranchPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  branches: BranchSummary[]
  selectedId?: string | null
  /**
   * `browse` (default): selecting just changes the browsing branch.
   * `moveOrder`: selecting a *different* branch than the cart confirms and
   * clears the cart first (a cart belongs to exactly one branch).
   */
  mode?: 'browse' | 'moveOrder'
  onSelected: (branch: Branch) => void
  /** In `moveOrder` mode, open straight on the clear-cart confirm for this branch. */
  initialTarget?: Branch | null
  title?: string
}

export function BranchPickerDialog({
  open,
  onOpenChange,
  branches,
  selectedId,
  mode = 'browse',
  onSelected,
  initialTarget = null,
  title = 'Which Púca is yours?',
}: BranchPickerDialogProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} shape="center">
      {/* Guard so the branch-detail queries only fire while the dialog is open
          (this dialog is mounted on every page via the header chip). */}
      {open && (
        <BranchPickerBody
          branches={branches}
          selectedId={selectedId}
          mode={mode}
          initialTarget={initialTarget}
          onSelected={(branch) => {
            onSelected(branch)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </Modal>
  )
}

interface BranchPickerBodyProps {
  branches: BranchSummary[]
  selectedId?: string | null
  mode: 'browse' | 'moveOrder'
  initialTarget: Branch | null
  onSelected: (branch: Branch) => void
  onCancel: () => void
}

function BranchPickerBody({
  branches,
  selectedId,
  mode,
  initialTarget,
  onSelected,
  onCancel,
}: BranchPickerBodyProps) {
  const { cart, itemCount, clearCart } = useCart()
  // Fresh mount on each open (Radix unmounts closed content), so seeding from
  // initialTarget here jumps straight to the confirm for a one-tap switch.
  const [pendingMove, setPendingMove] = useState<Branch | null>(initialTarget)

  function handleSelect(branch: Branch) {
    const needsFreshCart =
      mode === 'moveOrder' && cart.lines.length > 0 && branch.id !== cart.branchId
    if (needsFreshCart) {
      setPendingMove(branch)
      return
    }
    onSelected(branch)
  }

  if (pendingMove) {
    return (
      <div className="flex flex-col gap-4 px-6 py-5">
        <div>
          <h2 className="display text-xl">Start a fresh cart?</h2>
          <p className="mt-2 text-[15px] text-muted">
            Your cart has {itemCount} item{itemCount === 1 ? '' : 's'} from{' '}
            <strong className="text-ink">{cart.branchName}</strong>. Switching to{' '}
            <strong className="text-ink">{pendingMove.name}</strong> clears it and starts fresh.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setPendingMove(null)}>
            Keep {cart.branchName ?? 'my cart'}
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              clearCart()
              onSelected(pendingMove)
            }}
          >
            Switch &amp; start fresh
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto px-6 pt-2 pb-6">
      <p className="mb-4 text-[15px] text-muted">
        Pick where you're ordering from — you can change it any time.
      </p>
      <BranchChooser branches={branches} selectedId={selectedId} onSelect={handleSelect} />
      {mode === 'moveOrder' && (
        <Button variant="ghost" className="mt-4" onClick={onCancel}>
          Never mind
        </Button>
      )}
    </div>
  )
}
