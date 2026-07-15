import { CalendarClock, MapPinned, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { errorMessage } from '@/api'
import { adminApi } from '@/api/admin-api'
import type { AdminBanner, AdminBannerCreate, AdminBannerUpdate } from '@/api/types'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SelectField, TextAreaField, TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'

import { localDateTimeToUtc, utcToLocalInput } from './local-time'
import { adminQueryKeys, useAdminBanners, useAdminBranches, useAdminRestaurants } from './queries'
import { AdminCard, AdminPage, ConfirmAction, ImageUploadField, PageHeader } from './shared'

const DISPLAY_TIMEZONE = 'Europe/Dublin'

function scheduleLabel(banner: AdminBanner): string {
  if (!banner.startsAt && !banner.endsAt) return 'Always eligible'
  const start = banner.startsAt ? new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short', timeZone: DISPLAY_TIMEZONE }).format(new Date(banner.startsAt)) : 'Now'
  const end = banner.endsAt ? new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short', timeZone: DISPLAY_TIMEZONE }).format(new Date(banner.endsAt)) : 'No end'
  return `${start} – ${end}`
}

function BannerEditor({
  banner,
  onClose,
}: {
  banner: AdminBanner | null
  onClose: () => void
}) {
  const restaurants = useAdminRestaurants()
  const branches = useAdminBranches()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [title, setTitle] = useState(banner?.title ?? '')
  const [body, setBody] = useState(banner?.body ?? '')
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? '')
  const [restaurantId, setRestaurantId] = useState(banner?.restaurantId ?? '')
  const [branchId, setBranchId] = useState(banner?.branchId ?? '')
  const [sortOrder, setSortOrder] = useState(String(banner?.sortOrder ?? 0))
  const [isActive, setIsActive] = useState(banner?.isActive ?? true)
  const [startsAt, setStartsAt] = useState(() => utcToLocalInput(banner?.startsAt ?? null, DISPLAY_TIMEZONE))
  const [endsAt, setEndsAt] = useState(() => utcToLocalInput(banner?.endsAt ?? null, DISPLAY_TIMEZONE))
  const [imageObjectKey, setImageObjectKey] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const scopedBranches = (branches.data ?? []).filter((branch) => branch.restaurantId === restaurantId)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('Give the banner a title.')
      return
    }
    const link = linkUrl.trim()
    if (link && !link.startsWith('https://') && !link.startsWith('/')) {
      setError('Use a full https:// URL or a site path starting with /.')
      return
    }
    let start: string | null
    let end: string | null
    try {
      start = startsAt ? localDateTimeToUtc(startsAt, DISPLAY_TIMEZONE) : null
      end = endsAt ? localDateTimeToUtc(endsAt, DISPLAY_TIMEZONE) : null
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : 'Check the schedule.')
      return
    }
    if (start && end && Date.parse(start) >= Date.parse(end)) {
      setError('The end must be after the start.')
      return
    }

    const shared = {
      title: title.trim(),
      body: body.trim() || null,
      linkUrl: link || null,
      restaurantId: restaurantId || null,
      branchId: branchId || null,
      sortOrder: Number(sortOrder) || 0,
      isActive,
      startsAt: start,
      endsAt: end,
    }
    setSaving(true)
    try {
      if (banner) {
        const update: AdminBannerUpdate = {
          ...shared,
          ...(imageObjectKey !== undefined ? { imageObjectKey } : {}),
        }
        await adminApi.updateAdminBanner(banner.id, update, banner.updatedAt)
        toast('Banner saved.')
      } else {
        const create: AdminBannerCreate = { ...shared, imageObjectKey: imageObjectKey ?? null }
        await adminApi.createAdminBanner(create)
        toast('Banner created.')
      }
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.banners })
      onClose()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const currentImage = imageObjectKey === null ? null : (banner?.imageUrl ?? null)
  return (
    <AdminCard className="mt-6 overflow-hidden">
      <form onSubmit={submit} noValidate>
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-[700]">{banner ? 'Edit banner' : 'New banner'}</h2>
            <p className="mt-0.5 text-[13px] text-muted">Upload first, then the save action attaches the image.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>Close</Button>
        </div>
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <TextField label="Title" value={title} maxLength={120} required onChange={(event) => setTitle(event.target.value)} />
            <TextAreaField label="Supporting copy" value={body} maxLength={1000} onChange={(event) => setBody(event.target.value)} />
            <TextField label="Link (optional)" type="url" placeholder="https://… or /r/…" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Start (optional)" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} hint="Ireland time" />
              <TextField label="End (optional)" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} hint="Ireland time" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Geo scope"
                value={restaurantId}
                onChange={(event) => {
                  setRestaurantId(event.target.value)
                  setBranchId('')
                }}
              >
                <option value="">Everywhere</option>
                {(restaurants.data ?? []).map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
              </SelectField>
              <SelectField label="Branch scope" value={branchId} disabled={!restaurantId} onChange={(event) => setBranchId(event.target.value)} hint={!restaurantId ? 'Select a restaurant first' : undefined}>
                <option value="">All branches</option>
                {scopedBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </SelectField>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <TextField label="Sort order" type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
              <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 text-[14px] font-[550]">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                Active when scheduled
              </label>
            </div>
          </div>
          <ImageUploadField
            label="Banner image"
            hint="JPEG, PNG, or WebP · up to 5 MiB"
            imageUrl={currentImage}
            onRequestUpload={adminApi.requestAdminBannerImage}
            onAttached={(objectKey) => setImageObjectKey(objectKey)}
            onRemove={() => setImageObjectKey(null)}
          />
        </div>
        {error && <p role="alert" className="mx-5 mb-4 rounded-[10px] bg-error-tint px-4 py-3 text-[14px] font-[550] text-error sm:mx-6">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-5 py-4 sm:px-6">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{banner ? 'Save banner' : 'Create banner'}</Button>
        </div>
      </form>
    </AdminCard>
  )
}

export function BannersPage() {
  const banners = useAdminBanners()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editor, setEditor] = useState<AdminBanner | null | 'new'>(null)
  const [deleting, setDeleting] = useState<AdminBanner | null>(null)
  const [deletingPending, setDeletingPending] = useState(false)

  async function deleteBanner() {
    if (!deleting) return
    setDeletingPending(true)
    try {
      await adminApi.deleteAdminBanner(deleting.id)
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.banners })
      toast('Banner deleted.')
      setDeleting(null)
    } catch (deleteError) {
      toast(errorMessage(deleteError))
    } finally {
      setDeletingPending(false)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Home merchandising"
        title="Banners"
        description="Schedule visual announcements, then scope them to the right restaurant or branch. Inactive and future banners stay here for review."
        action={<Button onClick={() => setEditor('new')}><Plus className="size-4" aria-hidden /> New banner</Button>}
      />
      {editor !== null && <BannerEditor key={editor === 'new' ? 'new' : editor.id} banner={editor === 'new' ? null : editor} onClose={() => setEditor(null)} />}
      <div className="mt-7">
        {banners.isPending ? <Skeleton className="h-48 w-full rounded-[20px]" /> : banners.isError ? <ErrorState message={errorMessage(banners.error)} onRetry={() => void banners.refetch()} /> : (banners.data?.length ?? 0) === 0 ? <EmptyState title="No banners yet" body="Create a scheduled banner when there is something worth saying." action={<Button onClick={() => setEditor('new')}>Create banner</Button>} /> : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {banners.data!.map((banner) => (
              <li key={banner.id}>
                <AdminCard className="overflow-hidden">
                  <div className="flex gap-4 p-4 sm:p-5">
                    <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-surface">
                      {banner.imageUrl ? <img src={banner.imageUrl} alt="" className="size-full object-cover" /> : <MapPinned className="size-5 text-muted" aria-hidden />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-[700]">{banner.title}</h2>
                        <Badge variant={banner.isActive ? 'basil-soft' : 'neutral'}>{banner.isActive ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      {banner.body && <p className="mt-1 line-clamp-2 text-[14px] text-muted">{banner.body}</p>}
                      <p className="mt-3 flex items-start gap-1.5 text-[13px] text-muted"><CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {scheduleLabel(banner)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 sm:px-5">
                    <p className="text-[13px] text-muted">{banner.branchId ? 'Branch scoped' : banner.restaurantId ? 'Restaurant scoped' : 'Platform-wide'} · Sort {banner.sortOrder}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditor(banner)}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(banner)}><Trash2 className="size-3.5" aria-hidden /> Delete</Button>
                    </div>
                  </div>
                </AdminCard>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmAction
        open={deleting !== null}
        title="Delete banner?"
        body="This removes the banner from the admin list and from future home-page reads."
        confirmLabel="Delete banner"
        destructive
        pending={deletingPending}
        onOpenChange={(open) => { if (!open) setDeleting(null) }}
        onConfirm={() => void deleteBanner()}
      />
    </AdminPage>
  )
}
