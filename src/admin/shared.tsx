import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'

import { errorMessage } from '@/api'
import { adminApi } from '@/api/admin-api'
import type { ImageUploadResponse, OpeningHour } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { TextField } from '@/components/ui/field'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[12px] font-[700] tracking-[0.14em] text-ember uppercase">{eyebrow}</p>
        <h1 className="display mt-1 text-[clamp(2rem,4vw,2.75rem)]">{title}</h1>
        <p className="mt-2 max-w-[65ch] text-[15px] text-muted">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

export function AdminPage({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-9">{children}</main>
}

export function AdminCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-[20px] border border-border bg-bg shadow-raised', className)}>{children}</section>
}

export function DetailLabel({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-[650] tracking-[0.08em] text-muted uppercase">{children}</p>
}

interface ImageUploadFieldProps {
  label: string
  hint: string
  imageUrl: string | null
  onRequestUpload: (input: {
    contentType: 'image/jpeg' | 'image/png' | 'image/webp'
    contentLengthBytes: number
    fileName?: string
  }) => Promise<ImageUploadResponse>
  onAttached: (objectKey: string) => void
  onRemove: () => void
}

/**
 * A deliberately two-step client for the server-owned asset protocol: request
 * a temporary upload, PUT bytes to that URL, then keep only the temporary key
 * in local form state. The entity mutation is what finalises/attaches it.
 */
export function ImageUploadField({
  label,
  hint,
  imageUrl,
  onRequestUpload,
  onAttached,
  onRemove,
}: ImageUploadFieldProps) {
  const id = useId()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function chooseFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Images must be 5 MiB or smaller.')
      return
    }
    const localPreview = URL.createObjectURL(file)
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return localPreview
    })
    setUploading(true)
    try {
      const upload = await onRequestUpload({
        contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        contentLengthBytes: file.size,
        fileName: file.name,
      })
      await adminApi.uploadAdminImage(upload.uploadUrl, file)
      onAttached(upload.objectKey)
    } catch (uploadError) {
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return null
      })
      setError(errorMessage(uploadError))
      onRemove()
    } finally {
      setUploading(false)
    }
  }

  const shownImage = previewUrl ?? imageUrl
  return (
    <div className="rounded-[16px] border border-dashed border-border bg-surface p-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid aspect-[4/3] w-full shrink-0 place-items-center overflow-hidden rounded-[12px] bg-bg sm:w-36">
          {shownImage ? (
            <img src={shownImage} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-7 text-muted" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-[650] text-ink">{label}</p>
          <p className="mt-1 text-[13px] text-muted">{hint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label htmlFor={id} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-[550] text-ink transition-colors hover:bg-bg">
              <ImagePlus className="size-4" aria-hidden />
              {uploading ? 'Uploading…' : shownImage ? 'Replace image' : 'Choose image'}
            </label>
            <input
              id={id}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
            {shownImage && (
              <Button
                size="sm"
                variant="ghost"
                disabled={uploading}
                onClick={() => {
                  setPreviewUrl((previous) => {
                    if (previous) URL.revokeObjectURL(previous)
                    return null
                  })
                  onRemove()
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Remove
              </Button>
            )}
          </div>
          {error && <p role="alert" className="mt-2 text-[13px] font-[550] text-error">{error}</p>}
        </div>
      </div>
    </div>
  )
}

interface ConfirmActionProps {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  destructive?: boolean
  pending?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ConfirmAction({
  open,
  title,
  body,
  confirmLabel,
  destructive = false,
  pending = false,
  onOpenChange,
  onConfirm,
}: ConfirmActionProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}>
      <div className="overflow-y-auto px-6 pt-2 pb-6">
        <div className="text-[15px] text-muted">{body}</div>
        <div className="mt-7 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant={destructive ? 'destructive' : 'primary'} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function HoursEditor({
  value,
  onChange,
}: {
  value: OpeningHour[]
  onChange: (value: OpeningHour[]) => void
}) {
  function update(index: number, patch: Partial<OpeningHour>) {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)))
  }

  function add(weekday: number) {
    onChange([...value, { weekday, opensAt: '12:00', closesAt: '22:00' }])
  }

  function remove(index: number) {
    onChange(value.filter((_, entryIndex) => entryIndex !== index))
  }

  return (
    <fieldset className="rounded-[16px] border border-border bg-surface p-4">
      <legend className="px-1 text-sm font-[650] text-ink">Opening hours</legend>
      <p className="mb-3 text-[13px] text-muted">Use one row per shift. Add a second row for split service.</p>
      <div className="space-y-2">
        {DAYS.map((day, weekday) => {
          const entries = value
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.weekday === weekday)
          return (
            <div key={day} className="rounded-[12px] bg-bg px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="w-24 text-[14px] font-[600]">{day}</p>
                {entries.length === 0 ? (
                  <p className="mr-auto text-[13px] text-muted">Closed</p>
                ) : (
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {entries.map(({ entry, index }) => (
                      <div key={`${weekday}-${index}`} className="flex flex-wrap items-center gap-2">
                        <TextField
                          label={`${day} opens`}
                          className="w-28 [&>label]:sr-only"
                          type="time"
                          value={entry.opensAt}
                          onChange={(event) => update(index, { opensAt: event.target.value })}
                        />
                        <span className="text-[13px] text-muted">to</span>
                        <TextField
                          label={`${day} closes`}
                          className="w-28 [&>label]:sr-only"
                          type="time"
                          value={entry.closesAt}
                          onChange={(event) => update(index, { closesAt: event.target.value })}
                        />
                        <button
                          type="button"
                          className="rounded-full px-2 py-1 text-[13px] text-muted hover:bg-surface hover:text-error"
                          onClick={() => remove(index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="rounded-full px-2 py-1 text-[13px] font-[600] text-basil-deep hover:bg-basil-tint"
                  onClick={() => add(weekday)}
                >
                  Add shift
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
