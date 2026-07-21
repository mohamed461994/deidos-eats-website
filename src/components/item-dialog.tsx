import { useRef, useState, type ReactNode } from 'react'

import type { MenuItem, ModifierOption } from '@/api/types'
import { effectiveUnitPriceCents, type CartRestaurant } from '@/cart/cart'
import { useCart } from '@/cart/context'
import { FoodImage } from '@/components/food-image'
import { ItemWizard } from '@/components/item-wizard'
import { PriceWasNow } from '@/components/price-was-now'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { QuantityStepper } from '@/components/ui/quantity'
import { useToast } from '@/components/ui/toast'
import { wizardSteps } from '@/lib/modifier-selection'
import { formatCents } from '@/lib/money'

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten',
  crustaceans: 'Crustaceans',
  eggs: 'Eggs',
  fish: 'Fish',
  peanuts: 'Peanuts',
  soybeans: 'Soya',
  milk: 'Milk',
  nuts: 'Tree nuts',
  celery: 'Celery',
  mustard: 'Mustard',
  sesame: 'Sesame',
  sulphites: 'Sulphites',
  lupin: 'Lupin',
  molluscs: 'Molluscs',
}

/**
 * Does this item open the multi-step wizard (has renderable modifier steps), or
 * the plain detail view? Also decides the Modal's `wide` shape. A pure check —
 * an optional group with no options isn't a step, so an item can carry modifier
 * groups yet still be a plain-detail item (see `wizardSteps`).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function itemUsesWizard(item: MenuItem): boolean {
  return wizardSteps(item.modifierGroups ?? []).length > 0
}

interface ItemDialogProps {
  item: MenuItem | null
  /** The restaurant this menu belongs to — travels onto the cart. */
  restaurant: CartRestaurant
  branchId: string
  branchName: string
  onClose: () => void
}

/**
 * The item detail dialog used on a branch menu: the Modal shell wrapping the
 * shared {@link ItemDetail} body. Reused verbatim by the home page's quick-add
 * dialog, which resolves the full menu item first and renders the same body.
 */
export function ItemDialog({ item, restaurant, branchId, branchName, onClose }: ItemDialogProps) {
  if (!item) return null
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={item.name}
      hideTitle
      shape="center"
      wide={itemUsesWizard(item)}
    >
      <ItemDetail
        key={item.id}
        item={item}
        restaurant={restaurant}
        branchId={branchId}
        branchName={branchName}
        onClose={onClose}
      />
    </Modal>
  )
}

interface ItemDetailProps {
  /** The fully-resolved menu item (with modifier groups) to customise. */
  item: MenuItem
  /** The restaurant this item belongs to — travels onto the cart. */
  restaurant: CartRestaurant
  branchId: string
  branchName: string
  onClose: () => void
}

/**
 * The add-to-cart seam for one menu item. Owns quantity, the branch-conflict
 * state, and the actual `addItem` call; delegates the choosing UI to either the
 * {@link ItemWizard} (items with modifier steps) or {@link PlainItemDetail}
 * (zero-step items). Per-item state resets via a `key` on this component (each
 * item remounts fresh), so no manual reset is needed.
 */
export function ItemDetail({ item, restaurant, branchId, branchName, onClose }: ItemDetailProps) {
  const { addItem, openCart, cart, itemCount: cartCount } = useCart()
  const { toast } = useToast()
  const [quantity, setQuantity] = useState(1)
  const [conflict, setConflict] = useState(false)
  // The options carried into the (deferred) conflict confirm — the wizard's
  // selection lives below this component, so we capture it at attempt time.
  const pendingOptions = useRef<ModifierOption[]>([])

  const steps = wizardSteps(item.modifierGroups ?? [])

  function handleAdd(options: ModifierOption[], force = false) {
    pendingOptions.current = options
    const result = addItem({ restaurant, branchId, branchName, item, options, quantity, force })
    if (result.outcome === 'conflict') {
      setConflict(true)
      return
    }
    toast(`${item.name} added`)
    onClose()
    openCart()
  }

  // The branch-conflict confirm block, swapped into the footer while a conflict
  // is pending. Identical Keep/Clear treatment (incl. `autoFocus` on Keep) as
  // before; only the source of the options changed (now captured in the ref).
  const conflictBlock: ReactNode = conflict ? (
    <div className="flex flex-col gap-3">
      <p className="text-[15px]">
        Your basket has {cartCount} item{cartCount === 1 ? '' : 's'} from{' '}
        <strong>
          {cart.restaurantName}
          {cart.branchName ? `, ${cart.branchName}` : ''}
        </strong>
        .{' '}
        {cart.restaurantId === restaurant.id
          ? `Switching to ${branchName} clears it — a basket is one branch only.`
          : `Starting a basket with ${restaurant.name} clears it — a basket is one restaurant only.`}
      </p>
      <div className="flex gap-2">
        <Button autoFocus variant="outline" className="flex-1" onClick={() => setConflict(false)}>
          Keep {cart.restaurantName ?? 'my'} basket
        </Button>
        <Button className="flex-1" onClick={() => handleAdd(pendingOptions.current, true)}>
          Clear &amp; start with {cart.restaurantId === restaurant.id ? branchName : restaurant.name}
        </Button>
      </div>
    </div>
  ) : null

  if (steps.length === 0) {
    return (
      <PlainItemDetail
        item={item}
        quantity={quantity}
        onQuantityChange={setQuantity}
        conflictBlock={conflictBlock}
        onAdd={() => handleAdd([])}
      />
    )
  }

  return (
    <ItemWizard
      item={item}
      steps={steps}
      quantity={quantity}
      onQuantityChange={setQuantity}
      onAdd={(options) => handleAdd(options)}
      footerOverride={conflictBlock ?? undefined}
    />
  )
}

/**
 * The zero-modifier detail view (drinks, desserts, sides without options): the
 * appetite-forward header and a single Add, in the default-size Modal — today's
 * layout minus the modifier groups. Shares the exact footer chrome + conflict
 * swap with the wizard.
 */
function PlainItemDetail({
  item,
  quantity,
  onQuantityChange,
  conflictBlock,
  onAdd,
}: {
  item: MenuItem
  quantity: number
  onQuantityChange: (q: number) => void
  conflictBlock: ReactNode
  onAdd: () => void
}) {
  const unitPrice = effectiveUnitPriceCents(item, [])
  return (
    <>
      <div className="overflow-y-auto">
        <FoodImage
          src={item.imageUrl ?? null}
          alt={item.description ?? item.name}
          fallbackLabel={item.name}
          className="aspect-[16/9] w-full sm:rounded-t-[24px]"
        />
        <div className="flex flex-col gap-4 px-6 py-5">
          <div>
            <h2 className="display text-2xl">{item.name}</h2>
            {item.description && <p className="mt-1.5 text-[15px] text-muted">{item.description}</p>}
            {item.onlinePromoPriceCents != null ? (
              <PriceWasNow
                baseCents={item.priceCents}
                promoCents={item.onlinePromoPriceCents}
                showSaving
                className="mt-2 text-lg"
              />
            ) : (
              <p className="tabular-nums mt-2 text-lg font-[750]">{formatCents(item.priceCents)}</p>
            )}
          </div>

          {item.allergens.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-[550] text-muted">Contains:</span>
              {item.allergens.map((a) => (
                <Badge key={a} variant="neutral">
                  {ALLERGEN_LABELS[a] ?? a}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-bg px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {conflictBlock ?? (
          <div className="flex items-center gap-4">
            <QuantityStepper value={quantity} onChange={onQuantityChange} label={item.name} />
            <Button size="lg" className="flex-1" onClick={onAdd}>
              Add · {formatCents(unitPrice * quantity)}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
