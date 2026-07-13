import { AlertTriangle, CalendarClock, Percent, Search } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'

import { errorMessage, isApiError } from '@/api'
import type { MenuCatalogItem, MenuItemUpdate, PromoState } from '@/api/types'
import { useAuth } from '@/auth/context'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SelectField, TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { formatCents } from '@/lib/money'

import {
  formatBranchDateTime,
  localDateTimeToUtc,
  utcToLocalInput,
} from './local-time'
import { useAccessibleBranches, usePromoCatalog, useUpdatePromo } from './queries'

interface SaveResult {
  ok: boolean
  message?: string
}

const STATUS_PRESENTATION: Record<
  PromoState,
  { label: string; variant: 'basil-soft' | 'crust' | 'neutral' }
> = {
  active: { label: 'Active', variant: 'basil-soft' },
  scheduled: { label: 'Scheduled', variant: 'crust' },
  expired: { label: 'Expired', variant: 'neutral' },
  none: { label: 'No promo', variant: 'neutral' },
}

function parseEuroCents(value: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

function priceInput(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2)
}

function PromoWindow({ item, timezone }: { item: MenuCatalogItem; timezone: string }) {
  if (!item.onlinePromoStartsAt && !item.onlinePromoEndsAt) {
    return <span>Runs until cleared</span>
  }
  if (item.onlinePromoStartsAt && item.onlinePromoEndsAt) {
    return (
      <span>
        {formatBranchDateTime(item.onlinePromoStartsAt, timezone)} –{' '}
        {formatBranchDateTime(item.onlinePromoEndsAt, timezone)}
      </span>
    )
  }
  if (item.onlinePromoStartsAt) {
    return <span>Starts {formatBranchDateTime(item.onlinePromoStartsAt, timezone)}</span>
  }
  return <span>Ends {formatBranchDateTime(item.onlinePromoEndsAt!, timezone)}</span>
}

function PromoEditor({
  item,
  timezone,
  pending,
  onCancel,
  onSave,
}: {
  item: MenuCatalogItem
  timezone: string
  pending: boolean
  onCancel: () => void
  onSave: (update: MenuItemUpdate) => Promise<SaveResult>
}) {
  const [price, setPrice] = useState(() => priceInput(item.onlinePromoPriceCents))
  const [startsAt, setStartsAt] = useState(() =>
    utcToLocalInput(item.onlinePromoStartsAt, timezone),
  )
  const [endsAt, setEndsAt] = useState(() => utcToLocalInput(item.onlinePromoEndsAt, timezone))
  const [error, setError] = useState<string | null>(null)
  const previewCents = parseEuroCents(price)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (previewCents === null || previewCents < 1) {
      setError('Enter a valid online price in euro, for example 9.50.')
      return
    }
    if (previewCents >= item.priceCents) {
      setError(`The online price must be lower than ${formatCents(item.priceCents)}.`)
      return
    }

    let startInstant: string | null
    let endInstant: string | null
    try {
      startInstant = startsAt ? localDateTimeToUtc(startsAt, timezone) : null
      endInstant = endsAt ? localDateTimeToUtc(endsAt, timezone) : null
    } catch (timeError) {
      setError(timeError instanceof Error ? timeError.message : 'Check the promo window.')
      return
    }
    if (startInstant && endInstant && Date.parse(startInstant) >= Date.parse(endInstant)) {
      setError('The promo end must be after its start.')
      return
    }

    const result = await onSave({
      onlinePromoPriceCents: previewCents,
      onlinePromoStartsAt: startInstant,
      onlinePromoEndsAt: endInstant,
      expectedUpdatedAt: item.updatedAt,
    })
    if (!result.ok) setError(result.message ?? 'The promo could not be saved.')
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-[16px] bg-surface p-4 sm:p-5"
      aria-label={`Edit online promo for ${item.name}`}
      noValidate
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <TextField
          label="Online price (€)"
          inputMode="decimal"
          placeholder="9.50"
          required
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          hint={`Base price ${formatCents(item.priceCents)} — till/POS stays at this base price.`}
        />
        <TextField
          label="Starts (optional)"
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
          hint={`Branch time · ${timezone}`}
        />
        <TextField
          label="Ends (optional)"
          type="datetime-local"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
          hint={`Branch time · ${timezone}`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <div>
          <p className="text-[13px] font-[550] text-muted">Online preview</p>
          <p className="tabular-nums text-[17px]">
            <span className="text-muted line-through">{formatCents(item.priceCents)}</span>{' '}
            <strong className="text-basil-deep">
              {previewCents !== null && previewCents > 0 ? formatCents(previewCents) : '—'}
            </strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save online promo
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-[10px] bg-error-tint px-4 py-3 text-[14px] font-[550] text-error">
          {error}
        </p>
      )}
    </form>
  )
}

function CatalogRow({
  item,
  timezone,
  editing,
  clearing,
  pending,
  onEdit,
  onCancelEdit,
  onSave,
  onAskClear,
  onCancelClear,
  onClear,
}: {
  item: MenuCatalogItem
  timezone: string
  editing: boolean
  clearing: boolean
  pending: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSave: (update: MenuItemUpdate) => Promise<SaveResult>
  onAskClear: () => void
  onCancelClear: () => void
  onClear: () => void
}) {
  const status = STATUS_PRESENTATION[item.promoState]
  return (
    <li className="border-b border-border px-4 py-5 last:border-b-0 sm:px-5">
      <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(9rem,0.7fr)_minmax(12rem,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-3">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" className="size-12 shrink-0 rounded-[10px] object-cover" />
          ) : (
            <div className="grid size-12 shrink-0 place-items-center rounded-[10px] bg-surface text-muted">
              <Percent className="size-5" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-[650] text-ink">{item.name}</p>
            <p className="truncate text-[13px] text-muted">{item.categoryName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:block">
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="min-w-0 text-[14px]">
          {item.onlinePromoPriceCents !== null ? (
            <>
              <p className="tabular-nums">
                <span className="text-muted line-through">{formatCents(item.priceCents)}</span>{' '}
                <strong className="text-basil-deep">{formatCents(item.onlinePromoPriceCents)}</strong>
              </p>
              <p className="mt-1 flex items-start gap-1.5 text-[13px] text-muted">
                <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <PromoWindow item={item} timezone={timezone} />
              </p>
            </>
          ) : (
            <p className="tabular-nums text-muted">Base {formatCents(item.priceCents)}</p>
          )}
        </div>

        <div className="flex flex-wrap justify-start gap-2 md:justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            disabled={pending}
            aria-label={`${item.promoState === 'none' ? 'Set promo' : 'Edit / reschedule'} for ${item.name}`}
          >
            {item.promoState === 'none' ? 'Set promo' : 'Edit / reschedule'}
          </Button>
          {item.promoState !== 'none' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onAskClear}
              disabled={pending}
              aria-label={`Clear promo for ${item.name}`}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {clearing && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-error-tint px-4 py-3">
          <p className="text-[14px] font-[550] text-error">
            Clear this online promo and its full schedule?
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onCancelClear} disabled={pending}>
              Keep promo
            </Button>
            <Button size="sm" variant="destructive" onClick={onClear} loading={pending}>
              Clear promo
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <PromoEditor
          key={item.updatedAt}
          item={item}
          timezone={timezone}
          pending={pending}
          onCancel={onCancelEdit}
          onSave={onSave}
        />
      )}
    </li>
  )
}

export function DiscountsPage() {
  const { role } = useAuth()
  const branches = useAccessibleBranches(role)
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [clearingItemId, setClearingItemId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const branchOptions = branches.data ?? []
  const effectiveBranchId = branchOptions.some((branch) => branch.id === selectedBranchId)
    ? selectedBranchId
    : (branchOptions[0]?.id ?? null)
  const catalog = usePromoCatalog(effectiveBranchId)
  const mutation = useUpdatePromo(effectiveBranchId)
  const { toast } = useToast()

  const selectedBranch = branchOptions.find((branch) => branch.id === effectiveBranchId) ?? null
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('en-IE')
    if (!query) return catalog.data ?? []
    return (catalog.data ?? []).filter(
      (item) =>
        item.name.toLocaleLowerCase('en-IE').includes(query) ||
        item.categoryName.toLocaleLowerCase('en-IE').includes(query),
    )
  }, [catalog.data, search])

  async function save(
    item: MenuCatalogItem,
    update: MenuItemUpdate,
    reportPageError = false,
  ): Promise<SaveResult> {
    setNotice(null)
    try {
      await mutation.mutateAsync({ itemId: item.id, update })
      setEditingItemId(null)
      setClearingItemId(null)
      toast(update.onlinePromoPriceCents === null ? 'Online promo cleared.' : 'Online promo saved.')
      return { ok: true }
    } catch (saveError) {
      if (isApiError(saveError) && saveError.status === 409) {
        await catalog.refetch()
        setEditingItemId(null)
        setClearingItemId(null)
        setNotice(
          'This item changed after you opened it. The latest catalog is loaded—review it before trying again.',
        )
        return { ok: false, message: 'The latest server state has been loaded.' }
      }
      const message = errorMessage(saveError)
      if (reportPageError) setNotice(message)
      return { ok: false, message }
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-[700] tracking-[-0.02em]">Online discounts</h1>
          <p className="mt-1 max-w-[68ch] text-[15px] text-muted">
            Schedule item-level prices for online checkout. The raw catalog keeps future and past
            schedules visible so they can be reviewed or reused.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-[14px] bg-crust-tint px-4 py-3 text-[14px] text-ink">
          <AlertTriangle className="mt-0.5 size-4.5 shrink-0" aria-hidden />
          <p>
            <strong>Online only</strong> — does not change till/POS prices or POS discounts.
          </p>
        </div>

        {branches.isError ? (
          <ErrorState message={errorMessage(branches.error)} onRetry={() => void branches.refetch()} />
        ) : branches.isPending ? (
          <Skeleton className="h-20 w-full rounded-[16px]" />
        ) : (branches.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No managed branches"
            body="A platform administrator must assign manager membership before this account can manage online discounts."
          />
        ) : (
          <>
            <div className="grid gap-4 rounded-[16px] border border-border bg-bg p-4 sm:grid-cols-[minmax(15rem,1fr)_minmax(12rem,0.7fr)] sm:p-5">
              <SelectField
                label="Branch"
                value={effectiveBranchId ?? ''}
                onChange={(event) => {
                  setSelectedBranchId(event.target.value)
                  setEditingItemId(null)
                  setClearingItemId(null)
                  setNotice(null)
                }}
                hint={
                  role === 'restaurant_manager'
                    ? 'Only branches assigned to you by server membership are available.'
                    : 'Administrators can manage any branch through the dedicated promo policy.'
                }
              >
                {branches.data?.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.restaurantName} · {branch.name}
                    {branch.town ? `, ${branch.town}` : ''}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Find an item"
                type="search"
                placeholder="Search item or category"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {notice && (
              <p role="status" className="rounded-[12px] bg-crust-tint px-4 py-3 text-[14px] font-[550] text-ink">
                {notice}
              </p>
            )}

            {catalog.isError ? (
              <ErrorState message={errorMessage(catalog.error)} onRetry={() => void catalog.refetch()} />
            ) : catalog.isPending || !selectedBranch ? (
              <div className="overflow-hidden rounded-[16px] border border-border">
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="flex items-center gap-4 border-b border-border p-5 last:border-0">
                    <Skeleton className="size-12 shrink-0 rounded-[10px]" />
                    <Skeleton className="h-5 flex-1" />
                    <Skeleton className="h-8 w-28" />
                  </div>
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-[16px] border border-border py-10 text-center">
                <Search className="mx-auto size-6 text-muted" aria-hidden />
                <p className="mt-3 font-[650]">No matching items</p>
                <p className="mt-1 text-[14px] text-muted">Try a different item or category name.</p>
              </div>
            ) : (
              <section aria-labelledby="catalog-heading" className="overflow-hidden rounded-[16px] border border-border bg-bg">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-5">
                  <div>
                    <h2 id="catalog-heading" className="font-[650]">{selectedBranch.name} catalog</h2>
                    <p className="text-[13px] text-muted">Times shown in {selectedBranch.timezone}</p>
                  </div>
                  <span className="text-[13px] text-muted">{filteredItems.length} items</span>
                </div>
                <ul>
                  {filteredItems.map((item) => (
                    <CatalogRow
                      key={item.id}
                      item={item}
                      timezone={selectedBranch.timezone}
                      editing={editingItemId === item.id}
                      clearing={clearingItemId === item.id}
                      pending={mutation.isPending}
                      onEdit={() => {
                        setEditingItemId(item.id)
                        setClearingItemId(null)
                        setNotice(null)
                      }}
                      onCancelEdit={() => setEditingItemId(null)}
                      onSave={(update) => save(item, update)}
                      onAskClear={() => {
                        setClearingItemId(item.id)
                        setEditingItemId(null)
                        setNotice(null)
                      }}
                      onCancelClear={() => setClearingItemId(null)}
                      onClear={() =>
                        void save(
                          item,
                          {
                            onlinePromoPriceCents: null,
                            expectedUpdatedAt: item.updatedAt,
                          },
                          true,
                        )
                      }
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
