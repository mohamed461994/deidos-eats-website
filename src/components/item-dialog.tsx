import { useMemo, useState } from 'react'

import type { MenuItem, ModifierGroup, ModifierOption } from '@/api/types'
import type { CartRestaurant } from '@/cart/cart'
import { useCart } from '@/cart/context'
import { FoodImage } from '@/components/food-image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { QuantityStepper } from '@/components/ui/quantity'
import { useToast } from '@/components/ui/toast'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

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

interface ItemDialogProps {
  item: MenuItem | null
  /** The restaurant this menu belongs to — travels onto the cart. */
  restaurant: CartRestaurant
  branchId: string
  branchName: string
  onClose: () => void
}

export function ItemDialog({ item, restaurant, branchId, branchName, onClose }: ItemDialogProps) {
  const { addItem, openCart, cart, itemCount: cartCount } = useCart()
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quantity, setQuantity] = useState(1)
  const [conflict, setConflict] = useState(false)
  const [groupErrors, setGroupErrors] = useState<Set<string>>(new Set())

  // Reset per item via key on the inner content
  const options = useMemo(() => {
    if (!item) return []
    return (item.modifierGroups ?? []).flatMap((g) => g.options)
  }, [item])

  if (!item) return null

  const selectedOptions = options.filter((o) => selected.has(o.id))
  const unitPrice =
    item.priceCents + selectedOptions.reduce((sum, o) => sum + o.priceDeltaCents, 0)

  function countIn(group: ModifierGroup): number {
    return group.options.filter((o) => selected.has(o.id)).length
  }

  function toggle(group: ModifierGroup, option: ModifierOption) {
    const next = new Set(selected)
    if (next.has(option.id)) {
      next.delete(option.id)
    } else {
      if (countIn(group) >= group.maxSelect) return
      next.add(option.id)
    }
    setSelected(next)
    if (groupErrors.has(group.id) && group.options.filter((o) => next.has(o.id)).length >= group.minSelect) {
      const errors = new Set(groupErrors)
      errors.delete(group.id)
      setGroupErrors(errors)
    }
  }

  function handleAdd(force = false) {
    if (!item) return
    const missing = (item.modifierGroups ?? []).filter((g) => countIn(g) < g.minSelect)
    if (missing.length > 0) {
      setGroupErrors(new Set(missing.map((g) => g.id)))
      return
    }
    const result = addItem({
      restaurant,
      branchId,
      branchName,
      item,
      options: selectedOptions,
      quantity,
      force,
    })
    if (result.outcome === 'conflict') {
      setConflict(true)
      return
    }
    toast(`${item.name} added`)
    reset()
    onClose()
    openCart()
  }

  function reset() {
    setSelected(new Set())
    setQuantity(1)
    setConflict(false)
    setGroupErrors(new Set())
  }

  return (
    <Modal
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset()
          onClose()
        }
      }}
      title={item.name}
      hideTitle
      shape="center"
    >
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
            <p className="tabular-nums mt-2 text-lg font-[750]">{formatCents(item.priceCents)}</p>
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

          {(item.modifierGroups ?? []).map((group) => {
            const count = countIn(group)
            const atMax = count >= group.maxSelect
            return (
              <fieldset key={group.id} className="rounded-[16px] border border-border p-4">
                <legend className="px-1 text-sm font-[650]">
                  {group.name}
                  <span className="ml-2 font-[450] text-muted">
                    {group.minSelect > 0 ? `Choose ${group.minSelect}–${group.maxSelect}` : `Up to ${group.maxSelect}`}
                  </span>
                </legend>
                {groupErrors.has(group.id) && (
                  <p role="alert" className="mb-2 text-[13px] font-[550] text-error">
                    Choose at least {group.minSelect} to continue.
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  {group.options.map((option) => {
                    const checked = selected.has(option.id)
                    const disabled = !option.isAvailable || (!checked && atMax)
                    return (
                      <label
                        key={option.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-surface',
                          disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4.5 accent-(--color-basil)"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggle(group, option)}
                        />
                        <span className="flex-1 text-[15px]">
                          {option.name}
                          {!option.isAvailable && (
                            <span className="ml-2 text-[13px] text-muted">Sold out</span>
                          )}
                        </span>
                        {option.priceDeltaCents > 0 && (
                          <span className="tabular-nums text-[15px] text-muted">
                            +{formatCents(option.priceDeltaCents)}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>
      </div>

      <div className="border-t border-border bg-bg px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {conflict ? (
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
              <Button
                autoFocus
                variant="outline"
                className="flex-1"
                onClick={() => setConflict(false)}
              >
                Keep {cart.restaurantName ?? 'my'} basket
              </Button>
              <Button className="flex-1" onClick={() => handleAdd(true)}>
                Clear &amp; start with {cart.restaurantId === restaurant.id ? branchName : restaurant.name}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <QuantityStepper value={quantity} onChange={setQuantity} label={item.name} />
            <Button size="lg" className="flex-1" onClick={() => handleAdd()}>
              Add · {formatCents(unitPrice * quantity)}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
