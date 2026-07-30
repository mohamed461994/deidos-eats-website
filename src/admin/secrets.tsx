/**
 * Managed credentials — rotate the third-party keys the platform runs on (`secrets_admin` only).
 *
 * The rule this file exists to hold: **a credential value lives in one `useState` and nowhere else.**
 * It is never written to the query cache, localStorage, sessionStorage, a URL, or a log line; it is
 * cleared in a `finally` block whatever the outcome, and the mutation is `reset()` so TanStack drops
 * the submitted variables it held for the observer. No GET in this feature returns a value, so the
 * cache has nothing to leak — keep it that way.
 */
import {
  AlertTriangle,
  Check,
  CircleHelp,
  KeyRound,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'

import { errorMessage } from '@/api'
import { ApiError } from '@/api/errors'
import type {
  ManagedSecret,
  ManagedSecretField,
  ManagedSecretId,
  ManagedSecretWriteResult,
} from '@/api/types'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TextAreaField, TextField } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'

import {
  useManagedSecrets,
  useRollbackManagedSecret,
  useSetManagedSecretsPaused,
  useUpdateManagedSecret,
  useVerifyManagedSecret,
} from './queries'
import { AdminCard, AdminPage, ConfirmAction, DetailLabel, PageHeader } from './shared'

const DISPLAY_TIMEZONE = 'Europe/Dublin'

/**
 * Turn off every helper that would copy a credential somewhere we don't control: browser autofill,
 * the spellchecker's network dictionary, and the password managers that offer to save what you type.
 * Spread into every field that can hold credential material.
 */
const NO_CAPTURE = {
  autoComplete: 'off',
  spellCheck: false,
  'data-1p-ignore': '',
  'data-lpignore': 'true',
} as const

/** What each integration is for, so an operator can tell what a bad key would break. */
const PURPOSE: Record<ManagedSecretId, string> = {
  stripe: 'Takes card payments and verifies Stripe’s webhook signatures.',
  here: 'Geocodes delivery addresses and decides whether one is inside a branch’s delivery radius.',
  apns: 'Delivers order updates to the iOS app.',
  fcm: 'Delivers order updates to Android devices.',
}

/**
 * Field presentation the API deliberately doesn’t carry: the expected shape, and which values are
 * multi-line documents. Keyed `secretId.fieldName`; an unknown field (a newer API) falls back to a
 * single-line masked input with no hint rather than breaking the page.
 */
const FIELD_META: Record<string, { hint: string; multiline?: boolean }> = {
  'stripe.secretKey': { hint: 'Begins sk_test_ or sk_live_.' },
  'stripe.webhookSecret': { hint: 'Begins whsec_. From the Stripe webhook endpoint.' },
  'here.apiKey': { hint: 'The REST API key from your HERE project.' },
  'apns.keyId': { hint: 'Ten characters, from the key you downloaded from Apple.' },
  'apns.teamId': { hint: 'Ten characters, from your Apple developer account.' },
  'apns.privateKey': { hint: 'The whole .p8 file, BEGIN and END lines included.', multiline: true },
  'fcm.serviceAccountJson': { hint: 'The whole Firebase service-account JSON document.', multiline: true },
}

/** Rotating Stripe or APNs/FCM leaves a second copy behind in a worker that recycles separately. */
const AFTER_ROTATION: Partial<Record<ManagedSecretId, string>> = {
  stripe: 'Refunds run in a separate worker with its own copy of this key — test a refund as well as a checkout.',
  apns: 'Push runs in a separate worker; send a test notification once it has recycled.',
  fcm: 'Push runs in a separate worker; send a test notification once it has recycled.',
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: DISPLAY_TIMEZONE,
  }).format(new Date(value))
}

type SyncState =
  /** The API cannot know what is in use — never render this as "in sync". */
  | { kind: 'unknown' }
  | { kind: 'unconfigured' }
  | { kind: 'inSync' }
  | { kind: 'drift'; reason: 'serverOnOldKey' | 'serverHasNoKey' | 'serverKeyNotStored' }

/**
 * Stored-versus-in-use, the distinction §7 of the plan exists to surface.
 *
 * `inUseFingerprint` ABSENT means unknown (APNs/FCM are loaded only by the push worker, which the
 * API never calls). Absent is not the same as `null` — null means the responding server holds
 * nothing, which *is* drift when something is stored. Testing with `in` is the only way to keep the
 * two apart; `??` or `== null` would silently report unknown as clean.
 */
function syncStateOf(secret: ManagedSecret): SyncState {
  if (!('inUseFingerprint' in secret)) return { kind: 'unknown' }
  const stored = secret.fingerprint ?? null
  const inUse = secret.inUseFingerprint ?? null
  if (stored === null && inUse === null) return { kind: 'unconfigured' }
  if (stored === inUse) return { kind: 'inSync' }
  if (stored === null) return { kind: 'drift', reason: 'serverKeyNotStored' }
  return { kind: 'drift', reason: inUse === null ? 'serverHasNoKey' : 'serverOnOldKey' }
}

/** Per-field 422 messages from the API. They name the field and the expected shape, never the value. */
function fieldIssuesOf(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  const issues = (error.details as { issues?: unknown } | undefined)?.issues
  if (!Array.isArray(issues)) return {}
  return Object.fromEntries(
    issues
      .filter(
        (issue): issue is { field: string; message: string } =>
          typeof issue === 'object' &&
          issue !== null &&
          typeof (issue as { field?: unknown }).field === 'string' &&
          typeof (issue as { message?: unknown }).message === 'string',
      )
      .map((issue) => [issue.field, issue.message]),
  )
}

function Fingerprint({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted">—</span>
  return <code className="font-mono text-[13px] tracking-wide tabular-nums text-ink">{value}</code>
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <DetailLabel>{label}</DetailLabel>
      <p className="mt-1 text-[14px] break-words">{children}</p>
    </div>
  )
}

// --- Kill switch ---------------------------------------------------------------------------------

function PauseControl({ paused }: { paused: boolean }) {
  const setPaused = useSetManagedSecretsPaused()
  const { toast } = useToast()

  async function toggle() {
    try {
      await setPaused.mutateAsync(!paused)
      toast(paused ? 'Credential changes resumed.' : 'Credential changes paused.')
    } catch (error) {
      toast(errorMessage(error))
    }
  }

  const Icon = paused ? PauseCircle : ShieldCheck
  return (
    <AdminCard className={paused ? 'border-error/40' : undefined}>
      <div
        className={`flex flex-col gap-4 rounded-[20px] p-5 sm:flex-row sm:items-center sm:justify-between ${paused ? 'bg-error-tint' : ''}`}
      >
        <div className="flex gap-3">
          <div
            className={`grid size-9 shrink-0 place-items-center rounded-full ${paused ? 'bg-bg text-error' : 'bg-surface text-basil'}`}
          >
            <Icon className="size-4.5" aria-hidden />
          </div>
          {/* The live region is the wrapper, not the heading: `role` on an <h2> would replace its
              heading role and drop it out of the document outline. */}
          <div role="status">
            <h2 className={`font-[700] ${paused ? 'text-error' : 'text-ink'}`}>
              {paused ? 'Credential changes are paused' : 'Credential changes are enabled'}
            </h2>
            <p className="mt-1 max-w-[68ch] text-[13px] text-muted">
              {paused
                ? 'Every rotation and rollback is refused. Status stays readable, so you can still see what is configured.'
                : 'Pausing refuses every rotation and rollback from the next request onwards — reach for it if a key or an account might be compromised. Removing the Cognito group is the fuller stop, and only the owner can do that.'}
            </p>
          </div>
        </div>
        <Button
          variant={paused ? 'primary' : 'outline'}
          className="shrink-0"
          loading={setPaused.isPending}
          onClick={() => void toggle()}
        >
          {paused ? 'Resume changes' : 'Pause changes'}
        </Button>
      </div>
    </AdminCard>
  )
}

// --- Drift ---------------------------------------------------------------------------------------

function SyncNotice({ secret, onRefresh, refreshing }: { secret: ManagedSecret; onRefresh: () => void; refreshing: boolean }) {
  const sync = syncStateOf(secret)
  if (sync.kind === 'unconfigured') return null

  if (sync.kind === 'unknown') {
    return (
      <div className="flex items-start gap-2.5 rounded-[12px] bg-surface px-4 py-3">
        <CircleHelp className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <p className="text-[13px] text-ink">
          In-use key unknown for this integration.{' '}
          <span className="text-muted">
            Only the push-notification worker loads it, and the API cannot see what that worker holds. Confirm a
            rotation by sending a test notification.
          </span>
        </p>
      </div>
    )
  }

  if (sync.kind === 'inSync') {
    return (
      <div className="flex items-start gap-2.5 rounded-[12px] bg-basil-tint px-4 py-3">
        <Check className="mt-0.5 size-4 shrink-0 text-basil" aria-hidden />
        <p className="text-[13px] text-ink">
          Stored key matches the key in use.{' '}
          <span className="text-muted">As reported by the server that answered this request.</span>
        </p>
      </div>
    )
  }

  const headline =
    sync.reason === 'serverOnOldKey'
      ? 'New key stored. Still using the previous key — it goes live as servers recycle.'
      : sync.reason === 'serverHasNoKey'
        ? 'New key stored. This server has no key loaded yet — it goes live as servers recycle.'
        : 'This server is using a key that is no longer the stored one.'

  return (
    <div role="status" className="rounded-[12px] bg-crust-tint px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ember" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-[550] text-ink">{headline}</p>
          <p className="mt-1 text-[13px] text-muted">
            The in-use value is what the single server that answered this request holds — two refreshes can
            legitimately disagree while containers recycle. Refresh until every answer matches.
            {AFTER_ROTATION[secret.id] ? ` ${AFTER_ROTATION[secret.id]}` : ''}
          </p>
          <Button size="sm" variant="outline" className="mt-3" loading={refreshing} onClick={onRefresh}>
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh status
          </Button>
        </div>
      </div>
    </div>
  )
}

// --- Rotation form ------------------------------------------------------------------------------

function SecretValueField({
  field,
  secretId,
  value,
  error,
  disabled,
  onChange,
}: {
  field: ManagedSecretField
  secretId: ManagedSecretId
  value: string
  error?: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const meta = FIELD_META[`${secretId}.${field.name}`]
  const hint = [
    meta?.hint,
    field.configured ? 'Leave blank to keep the current value.' : field.required ? 'Required.' : 'Optional.',
  ]
    .filter(Boolean)
    .join(' ')

  if (meta?.multiline) {
    return (
      <TextAreaField
        label={field.label}
        // A textarea cannot be type="password", and this value is a multi-line document (a .p8 file,
        // a JSON blob) that an <input> would mangle on paste. `-webkit-text-security` masks it in
        // Chromium/Safari/Firefox 127+; on anything older it renders in clear text on screen. That is
        // a shoulder-surfing risk only — the invariant that matters (the value lives in this
        // component's state and nowhere else) does not depend on masking.
        className="[&>textarea]:[-webkit-text-security:disc] [&>textarea]:min-h-24 [&>textarea]:font-mono [&>textarea]:text-[13px]"
        hint={hint}
        error={error}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...NO_CAPTURE}
      />
    )
  }

  return (
    <TextField
      label={field.label}
      type="password"
      hint={hint}
      error={error}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      {...NO_CAPTURE}
    />
  )
}

function RotationForm({
  secret,
  onClose,
  onWritten,
}: {
  secret: ManagedSecret
  onClose: () => void
  onWritten: (result: ManagedSecretWriteResult) => void
}) {
  const update = useUpdateManagedSecret()
  /** THE ONLY HOME OF A SUBMITTED VALUE. Cleared in the `finally` below, on every path. */
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)

  const filled = Object.entries(values).filter(([, value]) => value.trim().length > 0)
  const changedLabels = filled
    .map(([name]) => secret.fields.find((field) => field.name === name)?.label ?? name)
    .join(', ')

  function review(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    if (filled.length === 0) {
      setError('Enter at least one new value.')
      return
    }
    setConfirming(true)
  }

  async function submit(typedConfirmation: string) {
    // Blank fields are OMITTED, not sent as '': an empty string fails the server's format gate, and
    // omission is what makes partial rotation work.
    const fields = Object.fromEntries(filled.map(([name, value]) => [name, value.trim()]))
    try {
      const result = await update.mutateAsync({
        secretId: secret.id,
        input: { fields, confirm: typedConfirmation },
      })
      onWritten(result)
      onClose()
    } catch (writeError) {
      setError(errorMessage(writeError))
      setFieldErrors(fieldIssuesOf(writeError))
    } finally {
      // Whatever happened, the plaintext goes now: local state first, then the mutation's retained
      // `variables`. `gcTime: 0` alone is not enough while this component is still an observer.
      setValues({})
      update.reset()
      setConfirming(false)
    }
  }

  return (
    <form onSubmit={review} className="fade-in border-t border-border bg-surface p-5" noValidate>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-[650]">Store a new {secret.label} credential</h3>
          <p className="mt-1 max-w-[70ch] text-[13px] text-muted">
            Values are write-only — they go straight to AWS Secrets Manager and are never shown again, here or
            anywhere else. Fill only what you are changing.
          </p>
        </div>
        <button
          type="button"
          aria-label="Cancel rotation"
          className="grid size-11 shrink-0 place-items-center rounded-[10px] text-muted transition-colors hover:bg-bg hover:text-ink"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {secret.fields.map((field) => (
          <SecretValueField
            key={field.name}
            field={field}
            secretId={secret.id}
            value={values[field.name] ?? ''}
            error={fieldErrors[field.name]}
            disabled={update.isPending}
            onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-[10px] bg-error-tint px-4 py-3 text-[14px] font-[550] text-error">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending}>
          Review and store
        </Button>
      </div>

      <ConfirmAction
        open={confirming}
        title={`Rotate the ${secret.label} credential?`}
        confirmLabel="Store new value"
        pending={update.isPending}
        confirmPhrase={secret.id}
        confirmPhraseLabel={`Type ${secret.id} to confirm`}
        body={
          <>
            <p>
              Storing a new <strong className="text-ink">{changedLabels}</strong>. The value is tested against{' '}
              {secret.label} first — if that check fails, nothing is written and nothing changes.
            </p>
            <p className="mt-3">
              Once stored, it goes live as servers recycle, not instantly.
              {AFTER_ROTATION[secret.id] ? ` ${AFTER_ROTATION[secret.id]}` : ''}
            </p>
          </>
        }
        onOpenChange={(open) => !open && setConfirming(false)}
        onConfirm={(typedConfirmation) => void submit(typedConfirmation)}
      />
    </form>
  )
}

// --- One credential -----------------------------------------------------------------------------

function WriteResult({ result, onDismiss }: { result: ManagedSecretWriteResult; onDismiss: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border bg-basil-tint px-5 py-4">
      <div className="min-w-0">
        <p className="text-[14px] font-[550] text-ink">
          Stored{result.verified ? ' and verified' : ''}. This is the only place the new version id appears.
        </p>
        <div className="mt-2 grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <DetailLabel>New fingerprint</DetailLabel>
            <p className="mt-1">
              <Fingerprint value={result.fingerprint} />
            </p>
          </div>
          <div>
            <DetailLabel>Version id</DetailLabel>
            <p className="mt-1">
              <code className="font-mono text-[13px] break-all text-ink">{result.versionId}</code>
            </p>
          </div>
        </div>
        {result.verifyMessage && <p className="mt-2 text-[13px] text-muted">{result.verifyMessage}</p>}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="grid size-11 shrink-0 place-items-center rounded-[10px] text-muted transition-colors hover:bg-bg hover:text-ink"
        onClick={onDismiss}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}

function SecretCard({
  secret,
  paused,
  onRefresh,
  refreshing,
}: {
  secret: ManagedSecret
  paused: boolean
  onRefresh: () => void
  refreshing: boolean
}) {
  const verify = useVerifyManagedSecret()
  const rollback = useRollbackManagedSecret()
  const { toast } = useToast()
  const [rotating, setRotating] = useState(false)
  const [written, setWritten] = useState<ManagedSecretWriteResult | null>(null)
  const [confirmRollback, setConfirmRollback] = useState(false)

  async function runVerify() {
    try {
      const result = await verify.mutateAsync(secret.id)
      toast(
        result.verified
          ? `${secret.label} key checked — it works.${result.verifyMessage ? ` ${result.verifyMessage}` : ''}`
          : `${secret.label} check failed. ${result.verifyMessage ?? 'The stored key was rejected.'}`,
      )
    } catch (error) {
      toast(errorMessage(error))
    }
  }

  async function runRollback() {
    try {
      const result = await rollback.mutateAsync(secret.id)
      setWritten(result)
      setConfirmRollback(false)
      toast(`${secret.label} rolled back to the previous key.`)
    } catch (error) {
      toast(errorMessage(error))
    }
  }

  return (
    <AdminCard className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border bg-surface px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-[700]">{secret.label}</h2>
            {secret.configured ? (
              <Badge variant="basil-soft">Configured</Badge>
            ) : (
              <Badge variant="neutral">Not configured</Badge>
            )}
            {secret.mode === 'live' && <Badge variant="ember">Live key</Badge>}
            {secret.mode === 'test' && <Badge variant="neutral">Test key</Badge>}
          </div>
          <p className="mt-1 max-w-[70ch] text-[13px] text-muted">{PURPOSE[secret.id]}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" onClick={() => setRotating(true)} disabled={paused || rotating}>
            <KeyRound className="size-3.5" aria-hidden />
            Rotate
          </Button>
          <Button size="sm" variant="outline" loading={verify.isPending} onClick={() => void runVerify()}>
            <ShieldCheck className="size-3.5" aria-hidden />
            Verify
          </Button>
          {secret.rollbackAvailable && (
            <Button size="sm" variant="ghost" disabled={paused} onClick={() => setConfirmRollback(true)}>
              <RotateCcw className="size-3.5" aria-hidden />
              Roll back
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-5">
        <SyncNotice secret={secret} onRefresh={onRefresh} refreshing={refreshing} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Stored fingerprint">
            <Fingerprint value={secret.fingerprint} />
          </Detail>
          <Detail label="In use on this server">
            {'inUseFingerprint' in secret ? (
              <Fingerprint value={secret.inUseFingerprint} />
            ) : (
              <span className="text-muted">Unknown</span>
            )}
          </Detail>
          <Detail label="Version">
            {secret.versionId ? (
              <code className="font-mono text-[13px] break-all text-ink">{secret.versionId}</code>
            ) : (
              <span className="text-muted">Not reported</span>
            )}
          </Detail>
          <Detail label="Last rotated">
            {formatWhen(secret.lastRotatedAt)}
            {secret.lastRotatedByEmail && <span className="text-muted"> · {secret.lastRotatedByEmail}</span>}
          </Detail>
          <Detail label="Last check">
            {secret.lastVerifyOk === null || secret.lastVerifyOk === undefined ? (
              <span className="text-muted">Never checked</span>
            ) : (
              <>
                <span className={secret.lastVerifyOk ? 'text-basil-deep' : 'text-error'}>
                  {secret.lastVerifyOk ? 'Passed' : 'Failed'}
                </span>
                <span className="text-muted"> · {formatWhen(secret.lastVerifiedAt)}</span>
              </>
            )}
          </Detail>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {secret.fields.map((field) => (
            <span
              key={field.name}
              className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12px] font-[550] text-ink"
            >
              {field.label}
              <span className="text-muted">
                · {field.configured ? 'set' : field.required ? 'required' : 'not set'}
              </span>
            </span>
          ))}
        </div>

        {paused && (
          <p className="text-[13px] text-muted">Rotation and rollback are paused for every credential.</p>
        )}
      </div>

      {rotating && (
        <RotationForm secret={secret} onClose={() => setRotating(false)} onWritten={setWritten} />
      )}

      {written && <WriteResult result={written} onDismiss={() => setWritten(null)} />}

      <ConfirmAction
        open={confirmRollback}
        title={`Roll back the ${secret.label} credential?`}
        body={`Restores the previous stored value and makes it current again — the recovery path when a rotation turns out to be wrong. Like a rotation, the restored key goes live as servers recycle.${
          AFTER_ROTATION[secret.id] ? ` ${AFTER_ROTATION[secret.id]}` : ''
        }`}
        confirmLabel="Roll back"
        destructive
        pending={rollback.isPending}
        onOpenChange={(open) => !open && setConfirmRollback(false)}
        onConfirm={() => void runRollback()}
      />
    </AdminCard>
  )
}

// --- Page ---------------------------------------------------------------------------------------

export function SecretsPage() {
  const secrets = useManagedSecrets()
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      await secrets.refetch()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Platform credentials"
        title="Secrets"
        description="Rotate the third-party keys the platform runs on. Values are write-only: they go to AWS Secrets Manager and are never returned, shown, logged, or kept in this browser — only a fingerprint comes back. A new key is tested against its provider before it is stored, and goes live as servers recycle."
        action={
          <Button variant="outline" loading={refreshing} onClick={() => void refresh()}>
            <RefreshCw className="size-4" aria-hidden />
            Refresh status
          </Button>
        }
      />

      {secrets.isPending ? (
        <div className="mt-7 space-y-5">
          <Skeleton className="h-24 w-full rounded-[20px]" />
          <Skeleton className="h-64 w-full rounded-[20px]" />
          <Skeleton className="h-64 w-full rounded-[20px]" />
        </div>
      ) : secrets.isError ? (
        <div className="mt-7">
          <ErrorState message={errorMessage(secrets.error)} onRetry={() => void secrets.refetch()} />
        </div>
      ) : secrets.data.items.length === 0 ? (
        <div className="mt-7">
          <EmptyState
            title="No managed credentials"
            body="This API build exposes no credentials for rotation. Nothing to do here."
          />
        </div>
      ) : (
        <>
          <div className="mt-7">
            <PauseControl paused={secrets.data.paused} />
          </div>
          <div className="mt-5 space-y-5">
            {secrets.data.items.map((secret) => (
              <SecretCard
                key={secret.id}
                secret={secret}
                paused={secrets.data.paused}
                onRefresh={() => void refresh()}
                refreshing={refreshing}
              />
            ))}
          </div>
        </>
      )}
    </AdminPage>
  )
}
