import { Archive, Building2, CirclePause, CirclePlay, Pencil, Plus, Rocket } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { errorMessage, isApiError } from '@/api'
import { adminApi } from '@/api/admin-api'
import type { AdminRestaurant, AdminRestaurantCreate, AdminRestaurantUpdate } from '@/api/types'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TextAreaField, TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'

import { adminQueryKeys, useAdminRestaurants } from './queries'
import { AdminCard, AdminPage, ConfirmAction, DetailLabel, ImageUploadField, PageHeader } from './shared'
import { hasApiValidationIssue } from './validation'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type RestaurantField = 'name' | 'slug' | 'tagline' | 'description' | 'heroImageAlt'
type RestaurantFieldErrors = Partial<Record<RestaurantField, string>>

function validateRestaurantFields(name: string, slug: string): RestaurantFieldErrors {
  const errors: RestaurantFieldErrors = {}
  if (!name.trim()) errors.name = 'Give the restaurant a name.'

  const normalizedSlug = slug.trim().toLowerCase()
  if (normalizedSlug && !slugPattern.test(normalizedSlug)) {
    errors.slug = 'Use lowercase words separated by single hyphens, for example coastal-kitchen.'
  }
  return errors
}

function validationErrorsFromApi(error: unknown): RestaurantFieldErrors {
  const fields: RestaurantField[] = ['name', 'slug', 'tagline', 'description', 'heroImageAlt']
  return fields.reduce<RestaurantFieldErrors>((errors, field) => {
    if (!hasApiValidationIssue(error, [field])) return errors
    errors[field] =
      field === 'slug'
        ? 'Use lowercase words separated by single hyphens, for example coastal-kitchen.'
        : 'Check this value and try again.'
    return errors
  }, {})
}

function statusBadge(restaurant: AdminRestaurant) {
  if (restaurant.lifecycleStatus === 'draft') return <Badge variant="crust">Draft</Badge>
  if (restaurant.lifecycleStatus === 'archived') return <Badge variant="neutral">Archived</Badge>
  return <Badge variant={restaurant.isPaused ? 'crust' : 'basil-soft'}>{restaurant.isPaused ? 'Paused' : 'Published'}</Badge>
}

function RestaurantEditor({
  restaurant,
  onClose,
  onCreated,
}: {
  restaurant: AdminRestaurant | null
  onClose: () => void
  onCreated: (restaurant: AdminRestaurant) => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(restaurant?.name ?? '')
  const [slug, setSlug] = useState(restaurant?.slug ?? '')
  const [tagline, setTagline] = useState(restaurant?.tagline ?? '')
  const [description, setDescription] = useState(restaurant?.description ?? '')
  const [heroImageAlt, setHeroImageAlt] = useState(restaurant?.heroImageAlt ?? '')
  const [logoObjectKey, setLogoObjectKey] = useState<string | null | undefined>(undefined)
  const [heroObjectKey, setHeroObjectKey] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<RestaurantFieldErrors>({})
  const [saving, setSaving] = useState(false)

  function clearFieldError(field: RestaurantField) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const clientErrors = validateRestaurantFields(name, slug)
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) {
      setError('Check the highlighted fields, then try again.')
      return
    }
    setSaving(true)
    try {
      if (restaurant) {
        const update: AdminRestaurantUpdate = {
          name: name.trim(),
          ...(slug.trim() ? { slug: slug.trim().toLowerCase() } : {}),
          tagline: tagline.trim() || null,
          description: description.trim() || null,
          heroImageAlt: heroImageAlt.trim() || null,
          ...(logoObjectKey !== undefined ? { logoObjectKey } : {}),
          ...(heroObjectKey !== undefined ? { heroImageObjectKey: heroObjectKey } : {}),
        }
        await adminApi.updateAdminRestaurant(restaurant.id, update, restaurant.updatedAt)
        toast('Restaurant details saved.')
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.restaurants })
        onClose()
      } else {
        const create: AdminRestaurantCreate = {
          name: name.trim(),
          slug: slug.trim() || null,
          tagline: tagline.trim() || null,
          description: description.trim() || null,
          heroImageAlt: heroImageAlt.trim() || null,
        }
        const created = await adminApi.createAdminRestaurant(create)
        toast('Draft restaurant created. Add its branding before publishing.')
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.restaurants })
        onCreated(created)
      }
    } catch (saveError) {
      const apiFieldErrors = validationErrorsFromApi(saveError)
      setFieldErrors(apiFieldErrors)
      setError(
        Object.keys(apiFieldErrors).length > 0
          ? 'Check the highlighted fields, then try again.'
          : errorMessage(saveError),
      )
    } finally {
      setSaving(false)
    }
  }

  const canEditSlug = !restaurant || restaurant.lifecycleStatus === 'draft'
  return (
    <AdminCard className="mt-6 overflow-hidden">
      <form onSubmit={submit} noValidate>
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-[700]">
              {restaurant ? `Edit ${restaurant.name}` : 'Create draft restaurant'}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {restaurant
                ? 'Logo and hero uploads attach only when you save this form.'
                : 'New restaurants always begin as drafts and stay invisible to buyers.'}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
            Close
          </Button>
        </div>
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <TextField
              label="Restaurant name"
              value={name}
              error={fieldErrors.name}
              required
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value)
                clearFieldError('name')
              }}
            />
            <TextField
              label="Website slug"
              value={slug}
              error={fieldErrors.slug}
              disabled={!canEditSlug}
              maxLength={60}
              hint={canEditSlug ? 'Lowercase words separated by hyphens. This freezes at publication.' : 'The slug is frozen after publication.'}
              onChange={(event) => {
                setSlug(event.target.value)
                clearFieldError('slug')
              }}
            />
            <TextField
              label="Tagline"
              value={tagline}
              error={fieldErrors.tagline}
              maxLength={160}
              onChange={(event) => {
                setTagline(event.target.value)
                clearFieldError('tagline')
              }}
            />
            <TextAreaField
              label="Description"
              value={description}
              error={fieldErrors.description}
              maxLength={2000}
              onChange={(event) => {
                setDescription(event.target.value)
                clearFieldError('description')
              }}
            />
            <TextField
              label="Hero image description"
              value={heroImageAlt}
              error={fieldErrors.heroImageAlt}
              maxLength={160}
              hint="Describe the image for people using a screen reader."
              onChange={(event) => {
                setHeroImageAlt(event.target.value)
                clearFieldError('heroImageAlt')
              }}
            />
          </div>
          {restaurant ? (
            <div className="space-y-4">
              <ImageUploadField
                label="Restaurant logo"
                hint="PNG transparency is preserved · JPEG, PNG, or WebP · up to 5 MiB"
                imageUrl={logoObjectKey === null ? null : restaurant.logoUrl ?? null}
                imageFit="contain"
                previewClassName="bg-basil-deep"
                onRequestUpload={(input) => adminApi.requestAdminRestaurantImage(restaurant.id, input)}
                onAttached={setLogoObjectKey}
                onRemove={() => setLogoObjectKey(null)}
              />
              <ImageUploadField
                label="Hero image"
                hint="JPEG, PNG, or WebP · up to 5 MiB"
                imageUrl={heroObjectKey === null ? null : restaurant.heroImageUrl ?? null}
                onRequestUpload={(input) => adminApi.requestAdminRestaurantImage(restaurant.id, input)}
                onAttached={setHeroObjectKey}
                onRemove={() => setHeroObjectKey(null)}
              />
            </div>
          ) : (
            <div className="rounded-[16px] bg-surface p-5">
              <Building2 className="size-6 text-basil" aria-hidden />
              <h3 className="mt-4 font-[700]">Branding comes next</h3>
              <p className="mt-1 text-[14px] text-muted">
                Create the draft first. The API uses the new restaurant identifier to scope temporary logo and hero uploads safely.
              </p>
            </div>
          )}
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
            {restaurant ? 'Save restaurant' : 'Create draft'}
          </Button>
        </div>
      </form>
    </AdminCard>
  )
}

interface PendingTransition {
  restaurant: AdminRestaurant
  kind: 'publish' | 'pause' | 'resume' | 'archive'
}

function transitionCopy(transition: PendingTransition): { title: string; confirm: string; body: ReactNode; destructive: boolean } {
  switch (transition.kind) {
    case 'publish':
      return {
        title: 'Publish this restaurant?',
        confirm: 'Publish restaurant',
        destructive: false,
        body: (
          <>
            <strong className="text-ink">Publishing makes this visible on the website AND every installed iOS build.</strong>
            <p className="mt-3">The API will block this if any order-enabled branch is missing a manager membership.</p>
          </>
        ),
      }
    case 'pause':
      return {
        title: 'Pause this restaurant?',
        confirm: 'Pause restaurant',
        destructive: false,
        body: 'Buyers will still see the restaurant but cannot start new online orders while it is paused.',
      }
    case 'resume':
      return {
        title: 'Resume this restaurant?',
        confirm: 'Resume restaurant',
        destructive: false,
        body: 'Online ordering will become available again for this published restaurant.',
      }
    case 'archive':
      return {
        title: 'Archive this restaurant?',
        confirm: 'Archive restaurant',
        destructive: true,
        body: 'Archived restaurants disappear from public discovery and cannot be published again.',
      }
  }
}

export function RestaurantsPage() {
  const restaurants = useAdminRestaurants()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editor, setEditor] = useState<AdminRestaurant | null | 'new'>(null)
  const [transition, setTransition] = useState<PendingTransition | null>(null)
  const [transitionPending, setTransitionPending] = useState(false)
  const [readiness, setReadiness] = useState<{ restaurantName: string; branches: string[] } | null>(null)

  async function submitTransition() {
    if (!transition) return
    setTransitionPending(true)
    const restaurant = transition.restaurant
    const input: AdminRestaurantUpdate =
      transition.kind === 'publish'
        ? { lifecycleStatus: 'published' }
        : transition.kind === 'archive'
          ? { lifecycleStatus: 'archived' }
          : { isPaused: transition.kind === 'pause' }
    try {
      await adminApi.updateAdminRestaurant(restaurant.id, input, restaurant.updatedAt)
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.restaurants })
      toast(
        transition.kind === 'publish'
          ? 'Restaurant published.'
          : transition.kind === 'archive'
            ? 'Restaurant archived.'
            : transition.kind === 'pause'
              ? 'Restaurant paused.'
              : 'Restaurant resumed.',
      )
      setTransition(null)
      setReadiness(null)
    } catch (transitionError) {
      if (isApiError(transitionError, 'publication_blocked')) {
        const branches = Array.isArray(transitionError.details?.missingBranches)
          ? transitionError.details.missingBranches.map((item) =>
              typeof item === 'object' && item !== null && 'name' in item
                ? String(item.name)
                : 'Unnamed branch',
            )
          : []
        setReadiness({ restaurantName: restaurant.name, branches })
        setTransition(null)
      } else {
        toast(errorMessage(transitionError))
      }
    } finally {
      setTransitionPending(false)
    }
  }

  const transitionDetails = transition ? transitionCopy(transition) : null
  return (
    <AdminPage>
      <PageHeader
        eyebrow="Marketplace onboarding"
        title="Restaurants"
        description="Create drafts, shape each restaurant’s brand, then control when it is publicly discoverable. Drafts are clearly labeled and never appear in buyer reads."
        action={
          <Button onClick={() => setEditor('new')}>
            <Plus className="size-4" aria-hidden />
            New restaurant
          </Button>
        }
      />
      {readiness && (
        <div role="alert" className="mt-6 rounded-[16px] border border-error/20 bg-error-tint px-5 py-4">
          <h2 className="font-[700] text-error">Publication is blocked for {readiness.restaurantName}</h2>
          <p className="mt-1 text-[14px] text-ink">
            Assign a manager membership to every branch below, then publish from this screen again. Membership assignment is an ops step, not an admin-panel action.
          </p>
          {readiness.branches.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-[14px] text-ink">
              {readiness.branches.map((branch) => <li key={branch}>{branch}</li>)}
            </ul>
          )}
        </div>
      )}
      {editor !== null && (
        <RestaurantEditor
          key={editor === 'new' ? 'new' : editor.id}
          restaurant={editor === 'new' ? null : editor}
          onClose={() => setEditor(null)}
          onCreated={(created) => setEditor(created)}
        />
      )}
      <div className="mt-7">
        {restaurants.isPending ? (
          <Skeleton className="h-72 w-full rounded-[20px]" />
        ) : restaurants.isError ? (
          <ErrorState message={errorMessage(restaurants.error)} onRetry={() => void restaurants.refetch()} />
        ) : (restaurants.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No restaurants yet"
            body="Create a draft to begin onboarding a new restaurant."
            action={<Button onClick={() => setEditor('new')}>Create draft</Button>}
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {restaurants.data!.map((restaurant) => (
              <li key={restaurant.id}>
                <AdminCard className="overflow-hidden">
                  <div className="relative min-h-44 bg-basil-deep">
                    {restaurant.heroImageUrl ? (
                      <img src={restaurant.heroImageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-75" />
                    ) : (
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--color-ember-tint),transparent_48%)]" />
                    )}
                    <div className="relative flex min-h-44 flex-col justify-between p-5 text-paper">
                      <div className="flex items-start justify-between gap-3">
                        {restaurant.logoUrl ? (
                          <img src={restaurant.logoUrl} alt="" className="size-12 object-contain drop-shadow-lg" />
                        ) : (
                          <div className="grid size-12 place-items-center rounded-[12px] bg-paper/15">
                            <Building2 className="size-5" aria-hidden />
                          </div>
                        )}
                        {statusBadge(restaurant)}
                      </div>
                      <div>
                        <h2 className="text-xl font-[750]">{restaurant.name}</h2>
                        <p className="mt-1 text-[14px] text-paper-muted">{restaurant.tagline ?? 'No tagline yet.'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <DetailLabel>Slug</DetailLabel>
                        <p className="mt-1 truncate text-[14px]">{restaurant.slug ?? 'Not set'}</p>
                      </div>
                      <div>
                        <DetailLabel>Visibility</DetailLabel>
                        <p className="mt-1 text-[14px]">
                          {restaurant.lifecycleStatus === 'draft'
                            ? 'Internal only'
                            : restaurant.lifecycleStatus === 'archived'
                              ? 'Archived'
                              : restaurant.isPaused
                                ? 'Visible, not accepting orders'
                                : 'Visible and live'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                      <Button size="sm" variant="outline" onClick={() => setEditor(restaurant)}>
                        <Pencil className="size-3.5" aria-hidden />
                        Edit branding
                      </Button>
                      {restaurant.lifecycleStatus === 'draft' && (
                        <Button size="sm" onClick={() => setTransition({ restaurant, kind: 'publish' })}>
                          <Rocket className="size-3.5" aria-hidden />
                          Publish
                        </Button>
                      )}
                      {restaurant.lifecycleStatus === 'published' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTransition({ restaurant, kind: restaurant.isPaused ? 'resume' : 'pause' })}
                        >
                          {restaurant.isPaused ? <CirclePlay className="size-3.5" aria-hidden /> : <CirclePause className="size-3.5" aria-hidden />}
                          {restaurant.isPaused ? 'Resume' : 'Pause'}
                        </Button>
                      )}
                      {restaurant.lifecycleStatus !== 'archived' && (
                        <Button size="sm" variant="ghost" onClick={() => setTransition({ restaurant, kind: 'archive' })}>
                          <Archive className="size-3.5" aria-hidden />
                          Archive
                        </Button>
                      )}
                    </div>
                  </div>
                </AdminCard>
              </li>
            ))}
          </ul>
        )}
      </div>
      {transition && transitionDetails && (
        <ConfirmAction
          open
          title={transitionDetails.title}
          body={transitionDetails.body}
          confirmLabel={transitionDetails.confirm}
          destructive={transitionDetails.destructive}
          pending={transitionPending}
          onOpenChange={(open) => {
            if (!open) setTransition(null)
          }}
          onConfirm={() => void submitTransition()}
        />
      )}
    </AdminPage>
  )
}
