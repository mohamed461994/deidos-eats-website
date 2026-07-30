/**
 * MOCK managed credentials (test + preview only; live mode hits the real API). Mirrors the parts of
 * the server's behaviour the UI depends on: the fixed four-credential registry, per-field format
 * gates, the typed confirmation, the pause kill switch, rollback availability, and — the reason this
 * file models state at all — stored-versus-in-use drift.
 *
 * It keeps the same invariant the real feature does: a submitted value is validated, reduced to a
 * fingerprint, and dropped. Nothing here retains credential material, so there is no mock store a
 * test could read a "secret" back out of.
 *
 * The in-use fingerprint is frozen at seed time, standing in for a warm Lambda container that
 * resolved its config at cold start. A rotation therefore produces real drift, which is what makes
 * the drift banner testable without a deploy.
 */
import type {
  ManagedSecret,
  ManagedSecretField,
  ManagedSecretId,
  ManagedSecretList,
  ManagedSecretUpdateRequest,
  ManagedSecretVerifyResult,
  ManagedSecretWriteResult,
} from '@/api/types'

import { ApiError } from '../errors'

interface FieldDefinition {
  name: string
  label: string
  required: boolean
  pattern: RegExp
  shapeHint: string
}

interface SecretDefinition {
  label: string
  fields: FieldDefinition[]
  /** Whether the API can know what the responding server holds (see the server's registry). */
  inUseKnowable: boolean
}

/** Mirrors `deidos-eats-api/src/platform/managed-secrets.ts`. Order matters: field one is primary. */
const DEFINITIONS: Record<ManagedSecretId, SecretDefinition> = {
  stripe: {
    label: 'Stripe',
    inUseKnowable: true,
    fields: [
      {
        name: 'secretKey',
        label: 'Secret key',
        required: true,
        pattern: /^sk_(test|live)_[A-Za-z0-9]{20,247}$/,
        shapeHint: 'Expected a Stripe secret key beginning with sk_test_ or sk_live_.',
      },
      {
        name: 'webhookSecret',
        label: 'Webhook signing secret',
        required: false,
        pattern: /^whsec_[A-Za-z0-9+/=]{20,247}$/,
        shapeHint: 'Expected a Stripe webhook signing secret beginning with whsec_.',
      },
    ],
  },
  here: {
    label: 'HERE Maps',
    inUseKnowable: true,
    fields: [
      {
        name: 'apiKey',
        label: 'API key',
        required: true,
        pattern: /^[A-Za-z0-9_-]{20,120}$/,
        shapeHint: 'Expected a HERE REST API key (letters, digits, hyphen or underscore).',
      },
    ],
  },
  apns: {
    label: 'Apple Push Notifications',
    inUseKnowable: false,
    fields: [
      { name: 'keyId', label: 'Key ID', required: true, pattern: /^[A-Z0-9]{10}$/, shapeHint: 'Expected a 10-character Apple key ID.' },
      { name: 'teamId', label: 'Team ID', required: true, pattern: /^[A-Z0-9]{10}$/, shapeHint: 'Expected a 10-character Apple team ID.' },
      {
        name: 'privateKey',
        label: 'Private key (.p8)',
        required: true,
        pattern: /^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----\s*$/,
        shapeHint: 'Expected the full contents of the .p8 file, including the BEGIN/END lines.',
      },
    ],
  },
  fcm: {
    label: 'Firebase Cloud Messaging',
    inUseKnowable: false,
    fields: [
      {
        name: 'serviceAccountJson',
        label: 'Service account JSON',
        required: true,
        pattern: /^\s*\{[\s\S]+\}\s*$/,
        shapeHint: 'Expected the full Firebase service-account JSON document.',
      },
    ],
  },
}

const SECRET_IDS = Object.keys(DEFINITIONS) as ManagedSecretId[]

interface SecretState {
  /** field name → fingerprint of the stored value. Absent key = not configured. */
  fingerprints: Record<string, string>
  /** What the "responding container" holds for the primary field. Null = holds nothing. */
  inUseFingerprint: string | null
  mode: 'test' | 'live' | null
  versionId: string | null
  previous: { fingerprint: string; versionId: string } | null
  lastRotatedAt: string | null
  lastRotatedByEmail: string | null
  lastVerifiedAt: string | null
  lastVerifyOk: boolean | null
}

interface MockSecretsState {
  paused: boolean
  secrets: Record<ManagedSecretId, SecretState>
}

/**
 * A 12-hex digest, matching the real fingerprint's SHA-256-prefix SHAPE but not its algorithm. The
 * mock only needs stable, distinct, comparable values; `crypto.subtle` is async and absent in jsdom,
 * and nothing here is a security control.
 */
function digest(value: string): string {
  let high = 0x811c9dc5
  let low = 0x01000193
  for (let index = 0; index < value.length; index += 1) {
    high = Math.imul(high ^ value.charCodeAt(index), 0x01000193) >>> 0
    low = Math.imul(low + value.charCodeAt(index) * (index + 1), 0x85ebca6b) >>> 0
  }
  return (high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0')).slice(0, 12)
}

function emptySecret(): SecretState {
  return {
    fingerprints: {},
    inUseFingerprint: null,
    mode: null,
    versionId: null,
    previous: null,
    lastRotatedAt: null,
    lastRotatedByEmail: null,
    lastVerifiedAt: null,
    lastVerifyOk: null,
  }
}

/**
 * Seeded so the panel shows every status at once: Stripe in sync on a test key, HERE already
 * drifting, APNs configured but unknowable, FCM never configured.
 */
function seed(): MockSecretsState {
  const stripeKey = digest('sk_test_mock_seeded_key')
  const hereStored = digest('here-key-rotated-yesterday')
  return {
    paused: false,
    secrets: {
      stripe: {
        ...emptySecret(),
        fingerprints: { secretKey: stripeKey, webhookSecret: digest('whsec_mock_seeded') },
        inUseFingerprint: stripeKey,
        mode: 'test',
        versionId: 'a1b2c3d4-0000-4000-8000-000000000001',
        lastRotatedAt: '2026-07-02T09:14:00.000Z',
        lastRotatedByEmail: 'admin@example.com',
        lastVerifiedAt: '2026-07-02T09:14:03.000Z',
        lastVerifyOk: true,
        previous: { fingerprint: digest('sk_test_mock_previous'), versionId: 'a1b2c3d4-0000-4000-8000-000000000000' },
      },
      here: {
        ...emptySecret(),
        fingerprints: { apiKey: hereStored },
        inUseFingerprint: digest('here-key-from-cold-start'),
        versionId: 'b2c3d4e5-0000-4000-8000-000000000002',
        lastRotatedAt: '2026-07-29T16:40:00.000Z',
        lastRotatedByEmail: 'admin@example.com',
        lastVerifiedAt: '2026-07-29T16:40:02.000Z',
        lastVerifyOk: true,
        previous: { fingerprint: digest('here-key-from-cold-start'), versionId: 'b2c3d4e5-0000-4000-8000-000000000001' },
      },
      apns: {
        ...emptySecret(),
        fingerprints: { keyId: digest('ABCD123456'), teamId: digest('TEAM123456'), privateKey: digest('p8-contents') },
        lastRotatedAt: '2026-06-11T11:02:00.000Z',
        lastRotatedByEmail: 'admin@example.com',
        lastVerifiedAt: '2026-06-11T11:02:01.000Z',
        lastVerifyOk: true,
        versionId: 'c3d4e5f6-0000-4000-8000-000000000001',
        previous: { fingerprint: digest('p8-previous'), versionId: 'c3d4e5f6-0000-4000-8000-000000000000' },
      },
      fcm: emptySecret(),
    },
  }
}

let state: MockSecretsState = seed()

function fail(status: number, code: string, message: string, details?: Record<string, unknown>): never {
  throw new ApiError(status, { code, message, ...(details ? { details } : {}) })
}

function toDto(id: ManagedSecretId): ManagedSecret {
  const definition = DEFINITIONS[id]
  const secret = state.secrets[id]
  const [primary] = definition.fields
  const fields: ManagedSecretField[] = definition.fields.map((field) => ({
    name: field.name,
    label: field.label,
    required: field.required,
    configured: secret.fingerprints[field.name] !== undefined,
  }))

  return {
    id,
    label: definition.label,
    configured: definition.fields.filter((field) => field.required).every((field) => secret.fingerprints[field.name] !== undefined),
    mode: secret.mode,
    fields,
    fingerprint: secret.fingerprints[primary.name] ?? null,
    // OMITTED, not null, when the API cannot know — the panel must not read this as "in sync".
    ...(definition.inUseKnowable ? { inUseFingerprint: secret.inUseFingerprint } : {}),
    versionId: secret.versionId,
    lastRotatedAt: secret.lastRotatedAt,
    lastRotatedByEmail: secret.lastRotatedByEmail,
    lastVerifiedAt: secret.lastVerifiedAt,
    lastVerifyOk: secret.lastVerifyOk,
    rollbackAvailable: secret.previous !== null,
  }
}

function requireDefinition(id: ManagedSecretId): SecretDefinition {
  const definition = DEFINITIONS[id]
  if (!definition) fail(404, 'not_found', 'No such managed credential.')
  return definition
}

export function resetAdminSecretsForTests(): void {
  state = seed()
}

export function listManagedSecretsForTests(): ManagedSecretList {
  return { items: SECRET_IDS.map(toDto), paused: state.paused }
}

export function updateManagedSecretForTests(
  id: ManagedSecretId,
  input: ManagedSecretUpdateRequest,
  actorEmail: string,
): ManagedSecretWriteResult {
  const definition = requireDefinition(id)
  const secret = state.secrets[id]

  if (state.paused) {
    fail(503, 'secrets_admin_paused', 'Credential changes are paused. Resume them before making changes.')
  }
  if (input.confirm !== id) {
    fail(422, 'confirmation_mismatch', `Type "${id}" to confirm which credential you are changing.`)
  }

  const submitted = Object.entries(input.fields)
  const issues = submitted
    .map(([name, value]) => {
      const field = definition.fields.find((candidate) => candidate.name === name)
      if (!field) return { field: name, message: 'This credential has no such field.' }
      // Never echo the value — only the field name and the expected shape.
      return field.pattern.test(value) ? null : { field: name, message: field.shapeHint }
    })
    .filter((issue): issue is { field: string; message: string } => issue !== null)

  const missingRequired = definition.fields
    .filter((field) => field.required && secret.fingerprints[field.name] === undefined)
    .filter((field) => input.fields[field.name] === undefined)
    .map((field) => ({ field: field.name, message: `${field.label} is required the first time this credential is set.` }))

  const allIssues = [...issues, ...missingRequired]
  if (allIssues.length > 0) {
    fail(422, 'validation_failed', 'One or more values have the wrong shape.', { issues: allIssues })
  }

  const [primary] = definition.fields
  const previousPrimary = secret.fingerprints[primary.name]
  const versionId = crypto.randomUUID()
  const next: Record<string, string> = { ...secret.fingerprints }
  submitted.forEach(([name, value]) => {
    next[name] = digest(value)
  })

  state.secrets[id] = {
    ...secret,
    fingerprints: next,
    // The container keeps whatever it resolved at start-up: this is the drift the panel surfaces.
    mode: id === 'stripe' && input.fields.secretKey ? (input.fields.secretKey.startsWith('sk_live_') ? 'live' : 'test') : secret.mode,
    versionId,
    previous: previousPrimary ? { fingerprint: previousPrimary, versionId: secret.versionId ?? versionId } : secret.previous,
    lastRotatedAt: new Date().toISOString(),
    lastRotatedByEmail: actorEmail,
    lastVerifiedAt: new Date().toISOString(),
    lastVerifyOk: true,
  }

  return {
    id,
    versionId,
    fingerprint: next[primary.name],
    verified: true,
    verifyMessage: DEFINITIONS[id].inUseKnowable ? null : 'Checked for format only — this credential has no online test.',
  }
}

export function verifyManagedSecretForTests(id: ManagedSecretId): ManagedSecretVerifyResult {
  const definition = requireDefinition(id)
  const secret = state.secrets[id]
  const configured = definition.fields.filter((field) => field.required).every((field) => secret.fingerprints[field.name] !== undefined)
  const checkedAt = new Date().toISOString()
  state.secrets[id] = { ...secret, lastVerifiedAt: checkedAt, lastVerifyOk: configured }
  return {
    id,
    verified: configured,
    checkedAt,
    verifyMessage: configured
      ? definition.inUseKnowable
        ? null
        : 'Checked for format only — this credential has no online test.'
      : 'No value is stored yet, so there is nothing to check.',
  }
}

export function rollbackManagedSecretForTests(id: ManagedSecretId, actorEmail: string): ManagedSecretWriteResult {
  const definition = requireDefinition(id)
  const secret = state.secrets[id]
  if (state.paused) {
    fail(503, 'secrets_admin_paused', 'Credential changes are paused. Resume them before making changes.')
  }
  if (!secret.previous) fail(404, 'not_found', 'There is no previous version to restore.')

  const [primary] = definition.fields
  const current = secret.fingerprints[primary.name]
  const restored = secret.previous
  state.secrets[id] = {
    ...secret,
    fingerprints: { ...secret.fingerprints, [primary.name]: restored.fingerprint },
    versionId: restored.versionId,
    previous: current ? { fingerprint: current, versionId: secret.versionId ?? restored.versionId } : null,
    lastRotatedAt: new Date().toISOString(),
    lastRotatedByEmail: actorEmail,
  }

  return { id, versionId: restored.versionId, fingerprint: restored.fingerprint, verified: true, verifyMessage: null }
}

export function setManagedSecretsPausedForTests(paused: boolean): void {
  state.paused = paused
}
