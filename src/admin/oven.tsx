import { CalendarClock, Flame, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { errorMessage } from '@/api'
import { adminApi } from '@/api/admin-api'
import type { OvenFeature, OvenFeatureCreate, OvenFeatureUpdate } from '@/api/types'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SelectField, TextAreaField, TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'

import { localDateTimeToUtc, utcToLocalInput } from './local-time'
import { adminQueryKeys, useAdminBranches, useAdminOvenFeatures, useAdminRestaurants, usePromoCatalog } from './queries'
import { AdminCard, AdminPage, ConfirmAction, PageHeader } from './shared'

function featureSchedule(feature: OvenFeature, timezone: string) {
  if (!feature.startsAt && !feature.endsAt) return 'Always eligible'
  const format = (value: string) => new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value))
  return `${feature.startsAt ? format(feature.startsAt) : 'Now'} – ${feature.endsAt ? format(feature.endsAt) : 'No end'}`
}

function OvenEditor({ feature, onClose }: { feature: OvenFeature | null; onClose: () => void }) {
  const restaurants = useAdminRestaurants()
  const branches = useAdminBranches()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const featureBranch = feature ? (branches.data ?? []).find((branch) => branch.id === feature.branchId) : null
  const [restaurantId, setRestaurantId] = useState(featureBranch?.restaurantId ?? '')
  const [branchId, setBranchId] = useState(feature?.branchId ?? '')
  const selectedBranch = (branches.data ?? []).find((branch) => branch.id === branchId) ?? null
  const catalog = usePromoCatalog(branchId || null)
  const [menuItemId, setMenuItemId] = useState(feature?.menuItemId ?? '')
  const [blurb, setBlurb] = useState(feature?.blurb ?? '')
  const [sortOrder, setSortOrder] = useState(String(feature?.sortOrder ?? 0))
  const [isActive, setIsActive] = useState(feature?.isActive ?? true)
  const timezone = selectedBranch?.timezone ?? 'Europe/Dublin'
  const [startsAt, setStartsAt] = useState(() => utcToLocalInput(feature?.startsAt ?? null, timezone))
  const [endsAt, setEndsAt] = useState(() => utcToLocalInput(feature?.endsAt ?? null, timezone))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const availableBranches = (branches.data ?? []).filter((branch) => branch.restaurantId === restaurantId)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!branchId || !menuItemId) {
      setError('Choose a restaurant, branch, and menu item.')
      return
    }
    let start: string | null
    let end: string | null
    try {
      start = startsAt ? localDateTimeToUtc(startsAt, timezone) : null
      end = endsAt ? localDateTimeToUtc(endsAt, timezone) : null
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : 'Check the schedule.')
      return
    }
    if (start && end && Date.parse(start) >= Date.parse(end)) {
      setError('The end must be after the start.')
      return
    }
    setSaving(true)
    try {
      if (feature) {
        const update: OvenFeatureUpdate = { blurb: blurb.trim() || null, sortOrder: Number(sortOrder) || 0, isActive, startsAt: start, endsAt: end }
        await adminApi.updateAdminOvenFeature(feature.id, update, feature.updatedAt)
        toast('Oven pick saved.')
      } else {
        const create: OvenFeatureCreate = { branchId, menuItemId, blurb: blurb.trim() || null, sortOrder: Number(sortOrder) || 0, isActive, startsAt: start, endsAt: end }
        await adminApi.createAdminOvenFeature(create)
        toast('Oven pick created.')
      }
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.ovenFeatures })
      onClose()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminCard className="mt-6 overflow-hidden">
      <form onSubmit={submit} noValidate>
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-[700]">{feature ? 'Edit oven pick' : 'New oven pick'}</h2>
            <p className="mt-0.5 text-[13px] text-muted">Each pick is anchored to the exact branch menu that serves it.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>Close</Button>
        </div>
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <SelectField label="Restaurant" value={restaurantId} disabled={Boolean(feature)} onChange={(event) => { setRestaurantId(event.target.value); setBranchId(''); setMenuItemId('') }}>
              <option value="">Choose restaurant</option>
              {(restaurants.data ?? []).map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
            </SelectField>
            <SelectField label="Branch" value={branchId} disabled={Boolean(feature) || !restaurantId} onChange={(event) => { setBranchId(event.target.value); setMenuItemId('') }}>
              <option value="">Choose branch</option>
              {availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </SelectField>
            <SelectField label="Menu item" value={menuItemId} disabled={Boolean(feature) || !branchId || catalog.isPending} onChange={(event) => setMenuItemId(event.target.value)} hint={catalog.isPending ? 'Loading branch menu…' : undefined}>
              <option value="">Choose menu item</option>
              {(catalog.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.categoryName} · {item.name}</option>)}
            </SelectField>
            {catalog.isError && <p role="alert" className="text-[13px] font-[550] text-error">{errorMessage(catalog.error)}</p>}
          </div>
          <div className="space-y-4">
            <TextAreaField label="Blurb (optional)" value={blurb} maxLength={280} placeholder="Why this deserves a place on the home page…" onChange={(event) => setBlurb(event.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Start (optional)" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} hint={`Branch time · ${timezone}`} />
              <TextField label="End (optional)" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} hint={`Branch time · ${timezone}`} />
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <TextField label="Sort order" type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
              <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 text-[14px] font-[550]">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active when scheduled
              </label>
            </div>
          </div>
        </div>
        {error && <p role="alert" className="mx-5 mb-4 rounded-[10px] bg-error-tint px-4 py-3 text-[14px] font-[550] text-error sm:mx-6">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-5 py-4 sm:px-6">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{feature ? 'Save pick' : 'Create pick'}</Button>
        </div>
      </form>
    </AdminCard>
  )
}

export function OvenPage() {
  const ovenFeatures = useAdminOvenFeatures()
  const branches = useAdminBranches()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editor, setEditor] = useState<OvenFeature | null | 'new'>(null)
  const [deleting, setDeleting] = useState<OvenFeature | null>(null)
  const [deletingPending, setDeletingPending] = useState(false)

  async function deleteFeature() {
    if (!deleting) return
    setDeletingPending(true)
    try {
      await adminApi.deleteAdminOvenFeature(deleting.id)
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.ovenFeatures })
      toast('Oven pick removed.')
      setDeleting(null)
    } catch (deleteError) {
      toast(errorMessage(deleteError))
    } finally {
      setDeletingPending(false)
    }
  }

  return (
    <AdminPage>
      <PageHeader eyebrow="Home merchandising" title="From the oven" description="Feature a specific menu item from a specific branch. Future and inactive picks remain visible here, never lost in the public projection." action={<Button onClick={() => setEditor('new')}><Plus className="size-4" aria-hidden /> New pick</Button>} />
      {editor !== null && <OvenEditor key={editor === 'new' ? 'new' : editor.id} feature={editor === 'new' ? null : editor} onClose={() => setEditor(null)} />}
      <div className="mt-7">
        {ovenFeatures.isPending || branches.isPending ? <Skeleton className="h-48 w-full rounded-[20px]" /> : ovenFeatures.isError ? <ErrorState message={errorMessage(ovenFeatures.error)} onRetry={() => void ovenFeatures.refetch()} /> : (ovenFeatures.data?.length ?? 0) === 0 ? <EmptyState title="No oven picks yet" body="Choose a dish that gives the home page a little heat." action={<Button onClick={() => setEditor('new')}>Create pick</Button>} /> : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {ovenFeatures.data!.map((feature) => {
              const branch = branches.data?.find((item) => item.id === feature.branchId)
              return <li key={feature.id}><AdminCard className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-full bg-ember-tint text-ember"><Flame className="size-5" aria-hidden /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-[700]">{feature.itemName ?? 'Unknown item'}</h2><Badge variant={feature.isActive ? 'basil-soft' : 'neutral'}>{feature.isActive ? 'Active' : 'Inactive'}</Badge></div><p className="mt-0.5 text-[13px] text-muted">{feature.branchName ?? branch?.name ?? 'Unknown branch'}</p></div></div>
                  <p className="shrink-0 text-[13px] text-muted">Sort {feature.sortOrder}</p>
                </div>
                {feature.blurb && <p className="mt-4 text-[14px] text-muted">{feature.blurb}</p>}
                <p className="mt-4 flex items-start gap-1.5 text-[13px] text-muted"><CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {featureSchedule(feature, branch?.timezone ?? 'Europe/Dublin')}</p>
                <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4"><Button size="sm" variant="outline" onClick={() => setEditor(feature)}><Pencil className="size-3.5" aria-hidden /> Edit</Button><Button size="sm" variant="ghost" onClick={() => setDeleting(feature)}><Trash2 className="size-3.5" aria-hidden /> Delete</Button></div>
              </AdminCard></li>
            })}
          </ul>
        )}
      </div>
      <ConfirmAction open={deleting !== null} title="Remove oven pick?" body="This removes the feature from admin and future home-page reads. The menu item itself is unchanged." confirmLabel="Remove pick" destructive pending={deletingPending} onOpenChange={(open) => { if (!open) setDeleting(null) }} onConfirm={() => void deleteFeature()} />
    </AdminPage>
  )
}
