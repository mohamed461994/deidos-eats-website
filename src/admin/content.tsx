import { ExternalLink, Save, Settings2, Type } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { errorMessage } from '@/api'
import { adminApi } from '@/api/admin-api'
import type { SiteContentEntry, SiteContentKey } from '@/api/types'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { TextAreaField, TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'

import { adminQueryKeys, useAdminContent } from './queries'
import { AdminCard, AdminPage, PageHeader } from './shared'

type ContentKind = 'text' | 'textarea' | 'url' | 'number' | 'boolean'
interface ContentMeta {
  label: string
  hint: string
  kind: ContentKind
  group: 'Home copy' | 'Store availability' | 'Home controls'
}

const CONTENT_META: Record<SiteContentKey, ContentMeta> = {
  heroHeading: { label: 'Hero heading', hint: 'The large welcome message at the top of home.', kind: 'text', group: 'Home copy' },
  heroSubheading: { label: 'Hero subheading', hint: 'The supporting sentence under the home heading.', kind: 'textarea', group: 'Home copy' },
  ovenSectionTitle: { label: 'From-the-oven title', hint: 'Use a concise heading for the editor-picked strip.', kind: 'text', group: 'Home copy' },
  discountedSectionTitle: { label: 'Discounted strip title', hint: 'Used for active online item promos.', kind: 'text', group: 'Home copy' },
  branchesSectionTitle: { label: 'Branches section title', hint: 'Shown before the branch feed when no location-specific default applies.', kind: 'text', group: 'Home copy' },
  footerNote: { label: 'Footer note', hint: 'A small plain-text note below the home sections.', kind: 'textarea', group: 'Home copy' },
  appStoreUrl: { label: 'App Store URL', hint: 'The badge is hidden from the home page until this HTTPS URL is set.', kind: 'url', group: 'Store availability' },
  playStoreUrl: { label: 'Google Play URL', hint: 'The badge is hidden from the home page until this HTTPS URL is set.', kind: 'url', group: 'Store availability' },
  geoRadiusKmDefault: { label: 'Default geo radius (km)', hint: 'Positive number used when home location has no explicit radius.', kind: 'number', group: 'Home controls' },
  promosEnabled: { label: 'Online promos enabled', hint: 'Emergency kill switch for online promo pricing. It does not touch POS prices.', kind: 'boolean', group: 'Home controls' },
}

function ContentField({ entry }: { entry: SiteContentEntry }) {
  const meta = CONTENT_META[entry.key]
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [text, setText] = useState(entry.value === null ? '' : String(entry.value))
  const [checked, setChecked] = useState(entry.value === true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    let value: string | number | boolean | null
    if (meta.kind === 'boolean') {
      value = checked
    } else if (meta.kind === 'number') {
      const number = Number(text)
      if (!Number.isFinite(number) || number <= 0) {
        setError('Enter a positive number.')
        return
      }
      value = number
    } else {
      value = text.trim() || null
      if (meta.kind === 'url' && value !== null && !value.startsWith('https://')) {
        setError('Use a full HTTPS URL.')
        return
      }
    }
    setSaving(true)
    try {
      await adminApi.setAdminContent(entry.key, { value }, entry.updatedAt)
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.content })
      toast(`${meta.label} saved.`)
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="border-b border-border px-5 py-5 last:border-b-0 sm:px-6" noValidate>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.9fr)_auto] lg:items-end">
        <div>
          <h3 className="font-[700]">{meta.label}</h3>
          <p className="mt-1 max-w-[42ch] text-[13px] text-muted">{meta.hint}</p>
        </div>
        {meta.kind === 'textarea' ? (
          <TextAreaField
            label={meta.label}
            className="[&>label]:sr-only"
            value={text}
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
          />
        ) : meta.kind === 'boolean' ? (
          <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 text-[14px] font-[550]">
            <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            {checked ? 'Enabled' : 'Disabled'}
          </label>
        ) : (
          <TextField
            label={meta.label}
            className="[&>label]:sr-only"
            type={meta.kind === 'url' ? 'url' : meta.kind === 'number' ? 'number' : 'text'}
            min={meta.kind === 'number' ? '0.01' : undefined}
            step={meta.kind === 'number' ? '0.1' : undefined}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
        <Button type="submit" size="sm" loading={saving}>
          <Save className="size-3.5" aria-hidden />
          Save
        </Button>
      </div>
      {error && <p role="alert" className="mt-3 text-[13px] font-[550] text-error">{error}</p>}
    </form>
  )
}

export function ContentPage() {
  const content = useAdminContent()
  const groups: ContentMeta['group'][] = ['Home copy', 'Store availability', 'Home controls']
  const icons = { 'Home copy': Type, 'Store availability': ExternalLink, 'Home controls': Settings2 }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Home configuration"
        title="Text & links"
        description="These are the complete typed content keys. Values render as plain text; clearing a public copy value restores the website default."
      />
      <div className="mt-7 space-y-6">
        {content.isPending ? (
          <Skeleton className="h-80 w-full rounded-[20px]" />
        ) : content.isError ? (
          <ErrorState message={errorMessage(content.error)} onRetry={() => void content.refetch()} />
        ) : (
          groups.map((group) => {
            const Icon = icons[group]
            const entries = (content.data ?? []).filter((entry) => CONTENT_META[entry.key].group === group)
            const description =
              group === 'Store availability'
                ? 'Home-page badges only appear after their URL is saved.'
                : group === 'Home controls'
                  ? 'Typed operational values with server-side validation.'
                  : 'Plain text for the buyer-facing home page.'

            return (
              <AdminCard key={group} className="overflow-hidden">
                <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-4 sm:px-6">
                  <div className="grid size-9 place-items-center rounded-full bg-bg text-basil">
                    <Icon className="size-4" aria-hidden />
                  </div>
                  <div>
                    <h2 className="font-[700]">{group}</h2>
                    <p className="text-[13px] text-muted">{description}</p>
                  </div>
                </div>
                {entries.map((entry) => <ContentField key={`${entry.key}-${entry.updatedAt}`} entry={entry} />)}
              </AdminCard>
            )
          })
        )}
      </div>
    </AdminPage>
  )
}
