import { Compass, MapPin, Pencil, Plus, Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { errorMessage, isApiError } from '@/api'
import { adminApi } from '@/api/admin-api'
import type { AdminBranch, AdminBranchCreate, AdminBranchUpdate, OpeningHour } from '@/api/types'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SelectField, TextAreaField, TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { formatCents } from '@/lib/money'

import { adminQueryKeys, useAdminBranches, useAdminRestaurants } from './queries'
import { AdminCard, AdminPage, DetailLabel, HoursEditor, ImageUploadField, PageHeader } from './shared'
import { hasApiValidationIssue } from './validation'

const eircodePattern = /^[AC-FHKNPRTV-Y][0-9]{2}\s?[0-9AC-FHKNPRTV-Y]{4}$/i

type BranchField =
  | 'restaurantId'
  | 'name'
  | 'description'
  | 'line1'
  | 'line2'
  | 'town'
  | 'county'
  | 'eircode'
  | 'latitude'
  | 'longitude'
  | 'timezone'
  | 'deliveryFee'
  | 'minimumOrder'
  | 'deliveryRadius'
  | 'deliveryBaseRadius'
  | 'deliveryPerKm'
  | 'openingHours'
type BranchFieldErrors = Partial<Record<BranchField, string>>

function euroInput(cents: number | null | undefined) {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2)
}

function parseCents(value: string): number | null | 'invalid' {
  if (!value.trim()) return null
  const number = Number(value.replace(',', '.'))
  if (!Number.isFinite(number) || number < 0) return 'invalid'
  return Math.round(number * 100)
}

function branchHoursSummary(hours: OpeningHour[]) {
  if (hours.length === 0) return 'No service hours configured'
  const days = new Set(hours.map((entry) => entry.weekday)).size
  return `${days} day${days === 1 ? '' : 's'} configured · ${hours.length} shift${hours.length === 1 ? '' : 's'}`
}

function validationErrorsFromApi(error: unknown): BranchFieldErrors {
  const errors: BranchFieldErrors = {}
  const add = (field: BranchField, path: string[], message: string) => {
    if (hasApiValidationIssue(error, path)) errors[field] = message
  }

  add('restaurantId', ['restaurantId'], 'Choose the restaurant this branch belongs to.')
  add('name', ['name'], 'Enter a branch name.')
  add('description', ['description'], 'Check the branch description.')
  add('timezone', ['timezone'], 'Enter a timezone, usually Europe/Dublin.')
  add('line1', ['address', 'line1'], 'Enter the first line of the address.')
  add('line2', ['address', 'line2'], 'Check the second address line.')
  add('town', ['address', 'town'], 'Enter the town or city.')
  add('county', ['address', 'county'], 'Enter the county.')
  add('eircode', ['address', 'eircode'], 'Enter a valid Irish Eircode, for example D02 X285.')
  add('latitude', ['address', 'latitude'], 'Enter a latitude between -90 and 90.')
  add('longitude', ['address', 'longitude'], 'Enter a longitude between -180 and 180.')
  add('deliveryFee', ['fulfillment', 'deliveryFeeCents'], 'Enter a valid delivery fee.')
  add('minimumOrder', ['fulfillment', 'minOrderCents'], 'Enter a valid minimum order.')
  add('deliveryRadius', ['fulfillment', 'deliveryRadiusKm'], 'Enter a delivery radius of zero or more.')
  add('deliveryBaseRadius', ['fulfillment', 'deliveryBaseRadiusKm'], 'Enter a base radius between 0 and 100 km.')
  add('deliveryPerKm', ['fulfillment', 'deliveryPerKmCents'], 'Enter a per-km rate of zero or more.')
  add('openingHours', ['openingHours'], 'Check the opening hours.')
  return errors
}

function BranchEditor({ branch, onClose, onCreated }: { branch: AdminBranch | null; onClose: () => void; onCreated: (branch: AdminBranch) => void }) {
  const restaurants = useAdminRestaurants()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [restaurantId, setRestaurantId] = useState(branch?.restaurantId ?? '')
  const [name, setName] = useState(branch?.name ?? '')
  const [description, setDescription] = useState(branch?.description ?? '')
  const [line1, setLine1] = useState(branch?.address.line1 ?? '')
  const [line2, setLine2] = useState(branch?.address.line2 ?? '')
  const [town, setTown] = useState(branch?.address.town ?? '')
  const [county, setCounty] = useState(branch?.address.county ?? '')
  const [eircode, setEircode] = useState(branch?.address.eircode ?? '')
  const [latitude, setLatitude] = useState(branch?.address.latitude?.toString() ?? '')
  const [longitude, setLongitude] = useState(branch?.address.longitude?.toString() ?? '')
  const [timezone, setTimezone] = useState(branch?.timezone ?? 'Europe/Dublin')
  const [hours, setHours] = useState<OpeningHour[]>(branch?.openingHours ?? [])
  const [collectionEnabled, setCollectionEnabled] = useState(branch?.fulfillment.collectionEnabled ?? true)
  const [deliveryEnabled, setDeliveryEnabled] = useState(branch?.fulfillment.deliveryEnabled ?? false)
  const [deliveryFee, setDeliveryFee] = useState(euroInput(branch?.fulfillment.deliveryFeeCents))
  const [minimumOrder, setMinimumOrder] = useState(euroInput(branch?.fulfillment.minOrderCents))
  const [deliveryRadius, setDeliveryRadius] = useState(branch?.fulfillment.deliveryRadiusKm?.toString() ?? '')
  // Tiered delivery pricing is part of the same fulfillment object on the API, so the form must
  // carry the branch's current values — a save that drops them would reset dashboard-configured
  // pricing to the server defaults (5 km base, flat fee).
  const [deliveryBaseRadius, setDeliveryBaseRadius] = useState(
    String(branch?.fulfillment.deliveryBaseRadiusKm ?? 5),
  )
  const [deliveryPerKm, setDeliveryPerKm] = useState(euroInput(branch?.fulfillment.deliveryPerKmCents ?? 0))
  const [cashEnabled, setCashEnabled] = useState(branch?.payment.cashEnabled ?? false)
  const [imageObjectKey, setImageObjectKey] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<BranchFieldErrors>({})
  const [saving, setSaving] = useState(false)

  function clearFieldError(field: BranchField) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  function coordinate(value: string): number | null | 'invalid' {
    if (!value.trim()) return null
    const number = Number(value)
    if (!Number.isFinite(number)) return 'invalid'
    return number
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const clientErrors: BranchFieldErrors = {}
    if (!restaurantId) clientErrors.restaurantId = 'Choose the restaurant this branch belongs to.'
    if (!name.trim()) clientErrors.name = 'Enter a branch name.'
    if (!line1.trim()) clientErrors.line1 = 'Enter the first line of the address.'
    if (!town.trim()) clientErrors.town = 'Enter the town or city.'
    if (!county.trim()) clientErrors.county = 'Enter the county.'
    if (!eircode.trim()) {
      clientErrors.eircode = 'Enter an Irish Eircode.'
    } else if (!eircodePattern.test(eircode.trim())) {
      clientErrors.eircode = 'Enter a valid Irish Eircode, for example D02 X285.'
    }
    if (!timezone.trim()) clientErrors.timezone = 'Enter a timezone, usually Europe/Dublin.'

    const lat = coordinate(latitude)
    const lng = coordinate(longitude)
    if (lat === 'invalid') clientErrors.latitude = 'Enter a latitude as a number.'
    if (lng === 'invalid') clientErrors.longitude = 'Enter a longitude as a number.'
    if (lat !== 'invalid' && lng !== 'invalid' && (lat === null) !== (lng === null)) {
      clientErrors.latitude = 'Enter both coordinates, or leave both blank.'
      clientErrors.longitude = 'Enter both coordinates, or leave both blank.'
    }
    if (typeof lat === 'number' && (lat < -90 || lat > 90)) {
      clientErrors.latitude = 'Enter a latitude between -90 and 90.'
    }
    if (typeof lng === 'number' && (lng < -180 || lng > 180)) {
      clientErrors.longitude = 'Enter a longitude between -180 and 180.'
    }
    const fee = parseCents(deliveryFee)
    const minimum = parseCents(minimumOrder)
    const radius = deliveryRadius.trim() ? Number(deliveryRadius) : null
    const baseRadius = deliveryBaseRadius.trim() ? Number(deliveryBaseRadius) : null
    const perKm = parseCents(deliveryPerKm)
    if (deliveryEnabled && fee === 'invalid') clientErrors.deliveryFee = 'Enter a delivery fee of zero or more.'
    if (deliveryEnabled && minimum === 'invalid') clientErrors.minimumOrder = 'Enter a minimum order of zero or more.'
    if (deliveryEnabled && radius !== null && (!Number.isFinite(radius) || radius < 0)) {
      clientErrors.deliveryRadius = 'Enter a delivery radius of zero or more.'
    }
    if (deliveryEnabled && (baseRadius === null || !Number.isFinite(baseRadius) || baseRadius < 0 || baseRadius > 100)) {
      clientErrors.deliveryBaseRadius = 'Enter a base radius between 0 and 100 km.'
    }
    if (deliveryEnabled && (perKm === null || perKm === 'invalid')) {
      clientErrors.deliveryPerKm = 'Enter a per-km rate of zero or more (0 keeps the fee flat).'
    }
    if (hours.some((entry) => entry.opensAt === entry.closesAt)) {
      clientErrors.openingHours = 'Opening and closing times must be different.'
    }
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) {
      setError('Check the highlighted fields, then try again.')
      return
    }
    const validLatitude = lat === 'invalid' ? null : lat
    const validLongitude = lng === 'invalid' ? null : lng
    const validFee = fee === 'invalid' ? null : fee
    const validMinimum = minimum === 'invalid' ? null : minimum
    // The API rejects null for the tiered fields and resets omitted ones to its defaults, so when
    // delivery is on they are always sent as the validated numbers; when it is off they are
    // omitted (the server ignores tiered pricing for non-delivery branches).
    const fulfillment = deliveryEnabled
      ? {
          collectionEnabled,
          deliveryEnabled: true,
          deliveryFeeCents: validFee,
          minOrderCents: validMinimum,
          deliveryRadiusKm: radius,
          deliveryBaseRadiusKm: baseRadius as number,
          deliveryPerKmCents: perKm as number,
        }
      : { collectionEnabled, deliveryEnabled: false, deliveryFeeCents: null, minOrderCents: null, deliveryRadiusKm: null }
    const address = { line1: line1.trim(), line2: line2.trim() || null, town: town.trim(), county: county.trim(), eircode: eircode.trim().toUpperCase(), latitude: validLatitude, longitude: validLongitude }
    setSaving(true)
    try {
      if (branch) {
        const update: AdminBranchUpdate = { name: name.trim(), description: description.trim() || null, address, timezone, fulfillment, payment: { cashEnabled }, openingHours: hours, ...(imageObjectKey !== undefined ? { imageObjectKey } : {}) }
        await adminApi.updateAdminBranch(branch.id, update, branch.updatedAt)
        toast('Branch saved.')
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.adminBranches })
        onClose()
      } else {
        const create: AdminBranchCreate = { restaurantId, name: name.trim(), description: description.trim() || null, address, timezone, fulfillment, payment: { cashEnabled }, openingHours: hours }
        const created = await adminApi.createAdminBranch(create)
        toast('Branch created. Add its cover image before publishing the restaurant.')
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.adminBranches })
        onCreated(created)
      }
    } catch (saveError) {
      const apiFieldErrors = validationErrorsFromApi(saveError)
      setFieldErrors(apiFieldErrors)
      setError(
        Object.keys(apiFieldErrors).length > 0
          ? 'Check the highlighted fields, then try again.'
          : isApiError(saveError, 'validation_failed')
            ? 'One or more values are invalid. Review the form and try again.'
            : errorMessage(saveError),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminCard className="mt-6 overflow-hidden">
      <form onSubmit={submit} noValidate>
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-[700]">{branch ? `Edit ${branch.name}` : 'Create branch'}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Coordinates keep nearest-first discovery and delivery checks accurate.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
            Close
          </Button>
        </div>
        <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-2">
          <div className="space-y-4">
            <SelectField
              label="Restaurant"
              value={restaurantId}
              error={fieldErrors.restaurantId}
              disabled={Boolean(branch)}
              onChange={(event) => {
                setRestaurantId(event.target.value)
                clearFieldError('restaurantId')
              }}
            >
              <option value="">Choose restaurant</option>
              {(restaurants.data ?? [])
                .filter((restaurant) => restaurant.lifecycleStatus !== 'archived')
                .map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}{restaurant.lifecycleStatus === 'draft' ? ' · Draft' : ''}
                  </option>
                ))}
            </SelectField>
            <TextField
              label="Branch name"
              value={name}
              error={fieldErrors.name}
              required
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value)
                clearFieldError('name')
              }}
            />
            <TextAreaField
              label="Description"
              value={description}
              error={fieldErrors.description}
              maxLength={500}
              onChange={(event) => {
                setDescription(event.target.value)
                clearFieldError('description')
              }}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Address line 1" value={line1} error={fieldErrors.line1} required maxLength={120} onChange={(event) => { setLine1(event.target.value); clearFieldError('line1') }} />
              <TextField label="Address line 2" value={line2} error={fieldErrors.line2} maxLength={120} onChange={(event) => { setLine2(event.target.value); clearFieldError('line2') }} />
              <TextField label="Town" value={town} error={fieldErrors.town} required maxLength={80} onChange={(event) => { setTown(event.target.value); clearFieldError('town') }} />
              <TextField label="County" value={county} error={fieldErrors.county} required maxLength={80} onChange={(event) => { setCounty(event.target.value); clearFieldError('county') }} />
              <TextField label="Eircode" value={eircode} error={fieldErrors.eircode} required maxLength={8} onChange={(event) => { setEircode(event.target.value); clearFieldError('eircode') }} />
              <TextField
                label="Timezone"
                value={timezone}
                error={fieldErrors.timezone}
                required
                maxLength={64}
                hint="IANA timezone, normally Europe/Dublin."
                onChange={(event) => {
                  setTimezone(event.target.value)
                  clearFieldError('timezone')
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Latitude"
                type="number"
                step="any"
                placeholder="53.3267"
                value={latitude}
                error={fieldErrors.latitude}
                onChange={(event) => {
                  setLatitude(event.target.value)
                  clearFieldError('latitude')
                }}
              />
              <TextField
                label="Longitude"
                type="number"
                step="any"
                placeholder="-6.2523"
                value={longitude}
                error={fieldErrors.longitude}
                onChange={(event) => {
                  setLongitude(event.target.value)
                  clearFieldError('longitude')
                }}
              />
            </div>
          </div>
          <div className="space-y-5">
            <fieldset className="rounded-[16px] border border-border bg-surface p-4">
              <legend className="px-1 text-sm font-[650] text-ink">Fulfillment</legend>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-3 text-[14px] font-[550]">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={collectionEnabled} onChange={(event) => setCollectionEnabled(event.target.checked)} />
                  Collection
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={deliveryEnabled} onChange={(event) => setDeliveryEnabled(event.target.checked)} />
                  Delivery
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={cashEnabled} onChange={(event) => setCashEnabled(event.target.checked)} />
                  Cash accepted
                </label>
              </div>
              {deliveryEnabled && (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <TextField label="Delivery fee (€)" inputMode="decimal" value={deliveryFee} error={fieldErrors.deliveryFee} onChange={(event) => { setDeliveryFee(event.target.value); clearFieldError('deliveryFee') }} />
                    <TextField label="Minimum order (€)" inputMode="decimal" value={minimumOrder} error={fieldErrors.minimumOrder} onChange={(event) => { setMinimumOrder(event.target.value); clearFieldError('minimumOrder') }} />
                    <TextField label="Radius (km)" inputMode="decimal" value={deliveryRadius} error={fieldErrors.deliveryRadius} onChange={(event) => { setDeliveryRadius(event.target.value); clearFieldError('deliveryRadius') }} />
                    <TextField label="Base radius (km)" inputMode="decimal" value={deliveryBaseRadius} error={fieldErrors.deliveryBaseRadius} onChange={(event) => { setDeliveryBaseRadius(event.target.value); clearFieldError('deliveryBaseRadius') }} />
                    <TextField label="Per extra km (€)" inputMode="decimal" value={deliveryPerKm} error={fieldErrors.deliveryPerKm} onChange={(event) => { setDeliveryPerKm(event.target.value); clearFieldError('deliveryPerKm') }} />
                  </div>
                  <p className="mt-3 text-[13px] text-muted">
                    The flat fee covers the base radius; each km beyond it adds the per-km rate, out to the delivery radius. Set the per-km rate to 0 for one flat fee everywhere.
                  </p>
                </>
              )}
            </fieldset>
            <HoursEditor value={hours} error={fieldErrors.openingHours} onChange={(nextHours) => {
              setHours(nextHours)
              clearFieldError('openingHours')
            }} />
            {branch ? (
              <ImageUploadField
                label="Branch cover image"
                hint="JPEG, PNG, or WebP · up to 5 MiB"
                imageUrl={imageObjectKey === null ? null : branch.imageUrl ?? null}
                onRequestUpload={(input) => adminApi.requestAdminBranchImage(branch.id, input)}
                onAttached={setImageObjectKey}
                onRemove={() => setImageObjectKey(null)}
              />
            ) : (
              <div className="rounded-[16px] bg-surface p-5">
                <Store className="size-6 text-basil" aria-hidden />
                <h3 className="mt-4 font-[700]">Cover image after creation</h3>
                <p className="mt-1 text-[14px] text-muted">
                  The API scopes temporary branch uploads to a real branch id, so create this branch first, then attach its image safely.
                </p>
              </div>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="mx-5 mb-4 rounded-[10px] bg-error-tint px-4 py-3 text-[14px] font-[550] text-error sm:mx-6">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-5 py-4 sm:px-6">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {branch ? 'Save branch' : 'Create branch'}
          </Button>
        </div>
      </form>
    </AdminCard>
  )
}

export function BranchesPage() {
  const branches = useAdminBranches()
  const restaurants = useAdminRestaurants()
  const [editor, setEditor] = useState<AdminBranch | null | 'new'>(null)
  const restaurantName = new Map((restaurants.data ?? []).map((restaurant) => [restaurant.id, restaurant.name]))

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Marketplace onboarding"
        title="Branches"
        description="Set the details that make each location orderable: a precise address, local opening hours, fulfillment rules, and a strong cover image."
        action={
          <Button onClick={() => setEditor('new')}>
            <Plus className="size-4" aria-hidden />
            New branch
          </Button>
        }
      />
      {editor !== null && (
        <BranchEditor
          key={editor === 'new' ? 'new' : editor.id}
          branch={editor === 'new' ? null : editor}
          onClose={() => setEditor(null)}
          onCreated={(created) => setEditor(created)}
        />
      )}
      <div className="mt-7">
        {branches.isPending || restaurants.isPending ? (
          <Skeleton className="h-72 w-full rounded-[20px]" />
        ) : branches.isError ? (
          <ErrorState message={errorMessage(branches.error)} onRetry={() => void branches.refetch()} />
        ) : (branches.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No branches yet"
            body="Create a branch under a restaurant to begin its operational setup."
            action={<Button onClick={() => setEditor('new')}>Create branch</Button>}
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {branches.data!.map((branch) => (
              <li key={branch.id}>
                <AdminCard className="overflow-hidden">
                  <div className="flex gap-4 p-5">
                    {branch.imageUrl ? (
                      <img src={branch.imageUrl} alt="" className="size-20 shrink-0 rounded-[12px] object-cover" />
                    ) : (
                      <div className="grid size-20 shrink-0 place-items-center rounded-[12px] bg-surface text-muted">
                        <MapPin className="size-6" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-[700]">{branch.name}</h2>
                        <Badge variant={branch.isOpen ? 'basil-soft' : 'neutral'}>
                          {branch.isOpen ? 'Order-enabled' : 'Closed'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[14px] text-muted">
                        {restaurantName.get(branch.restaurantId) ?? 'Unknown restaurant'} · {branch.address.town}
                      </p>
                      <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
                        <Compass className="size-3.5" aria-hidden />
                        {branch.address.latitude == null || branch.address.longitude == null
                          ? 'Coordinates missing'
                          : `${branch.address.latitude.toFixed(4)}, ${branch.address.longitude.toFixed(4)}`}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-t border-border bg-surface px-5 py-4">
                    <div>
                      <DetailLabel>Hours</DetailLabel>
                      <p className="mt-1 text-[13px] text-muted">{branchHoursSummary(branch.openingHours)}</p>
                    </div>
                    <div>
                      <DetailLabel>Fulfillment</DetailLabel>
                      <p className="mt-1 text-[13px] text-muted">
                        {[branch.fulfillment.collectionEnabled && 'Collection', branch.fulfillment.deliveryEnabled && 'Delivery']
                          .filter(Boolean)
                          .join(' + ') || 'Not configured'}
                        {branch.fulfillment.deliveryEnabled && branch.fulfillment.deliveryFeeCents != null
                          ? ` · ${formatCents(branch.fulfillment.deliveryFeeCents)}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end border-t border-border px-5 py-3">
                    <Button size="sm" variant="outline" onClick={() => setEditor(branch)}>
                      <Pencil className="size-3.5" aria-hidden />
                      Edit branch
                    </Button>
                  </div>
                </AdminCard>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminPage>
  )
}
