/**
 * The managed-credentials panel: the capability gate, the four drift states, and the invariant the
 * whole feature exists for — a submitted credential value must not survive anywhere in the client.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { resetMockApiForTests } from '@/api/mock/api'
import { mockStore } from '@/api/mock/store'
import { config } from '@/config'

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cXJjb2Rl'),
}))

const SECRETS_ADMIN = 'secrets-admin@example.ie'
const PLAIN_ADMIN = 'platform-admin@example.ie'
const PASSWORD = 'a-long-password!'
/**
 * Shaped like a Stripe test key so it clears the format gate, assembled at runtime so the committed
 * file carries no `sk_test_…` literal for a secret scanner to trip over.
 */
const STRIPE_KEY_PREFIX = ['sk', 'test', ''].join('_')
const NEW_STRIPE_KEY = `${STRIPE_KEY_PREFIX}51AbCdEfGhIjKlMnOpQrStUvWxYz0123456789`

function setField(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

async function signIn(email: string, landingHeading: RegExp) {
  render(<App />)
  await screen.findByLabelText(/staff email/i)
  setField(/staff email/i, email)
  setField(/^password/i, PASSWORD)
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  const code = await screen.findByLabelText(/6-digit authenticator code/i, {}, { timeout: 5000 })
  fireEvent.change(code, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: /verify and open panel/i }))
  await screen.findByRole('heading', { name: landingHeading }, { timeout: 5000 })
}

/** Read one labelled detail out of a credential card (both fingerprints are 12 hex characters). */
function detailValue(card: HTMLElement, label: string): string {
  return within(card).getByText(label).nextElementSibling?.textContent ?? ''
}

function goTo(path: string) {
  window.history.pushState({}, '', `${config.staffSignInPath}?next=${encodeURIComponent(path)}`)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetMockApiForTests()
  mockStore.seedStaffForTests(SECRETS_ADMIN, 'admin', {
    mfaEnrolled: true,
    capabilities: ['secrets_admin'],
  })
  mockStore.seedStaffForTests(PLAIN_ADMIN, 'admin', { mfaEnrolled: true })
})

afterEach(() => cleanup())

describe('managed credentials panel', () => {
  it('hides the section from a plain admin and refuses the route', async () => {
    goTo('/admin/secrets')
    // Without the capability the route falls through to the panel's default section.
    await signIn(PLAIN_ADMIN, /online discounts/i)

    expect(screen.queryByRole('link', { name: 'Secrets' })).toBeNull()
    expect(window.location.pathname).toBe('/admin/discounts')
    expect(screen.queryByRole('heading', { name: 'Secrets', level: 1 })).toBeNull()
  })

  it('renders every sync state distinctly for a capability holder', async () => {
    goTo('/admin/secrets')
    await signIn(SECRETS_ADMIN, /^secrets$/i)

    expect(screen.getByRole('link', { name: 'Secrets' })).toBeVisible()

    // Stripe: stored fingerprint equals the in-use one.
    const stripe = (await screen.findByRole('heading', { name: 'Stripe' })).closest('section')!
    within(stripe).getByText(/stored key matches the key in use/i)
    within(stripe).getByText('Test key')

    // HERE: seeded mid-rollout — the stored key is not the one the server is using.
    const here = screen.getByRole('heading', { name: 'HERE Maps' }).closest('section')!
    within(here).getByText(/still using the previous key/i)

    // APNs: the API cannot know, and unknown must never read as in sync.
    const apns = screen.getByRole('heading', { name: 'Apple Push Notifications' }).closest('section')!
    within(apns).getByText(/in-use key unknown for this integration/i)
    expect(within(apns).queryByText(/matches the key in use/i)).toBeNull()

    // FCM: nothing stored yet, so there is no rollout to report at all — not "in sync", and not
    // "unknown" either, which would imply something is out there.
    const fcm = screen.getByRole('heading', { name: 'Firebase Cloud Messaging' }).closest('section')!
    within(fcm).getByText('Not configured')
    expect(within(fcm).queryByText(/matches the key in use/i)).toBeNull()
    expect(within(fcm).queryByText(/goes live as servers recycle/i)).toBeNull()
    expect(within(fcm).queryByText(/in-use key unknown/i)).toBeNull()
  })

  it('rotates a key behind a typed confirmation and leaves no copy of the value', async () => {
    goTo('/admin/secrets')
    await signIn(SECRETS_ADMIN, /^secrets$/i)

    const stripe = (await screen.findByRole('heading', { name: 'Stripe' })).closest('section')!
    fireEvent.click(within(stripe).getByRole('button', { name: 'Rotate' }))

    const input = within(stripe).getByLabelText('Secret key') as HTMLInputElement
    // The field itself must not invite a browser or password manager to keep the value.
    expect(input.type).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(input.getAttribute('spellcheck')).toBe('false')
    expect(input.getAttribute('data-1p-ignore')).not.toBeNull()

    fireEvent.change(input, { target: { value: NEW_STRIPE_KEY } })
    fireEvent.click(within(stripe).getByRole('button', { name: /review and store/i }))

    const dialog = await screen.findByRole('dialog')
    const confirmButton = within(dialog).getByRole('button', { name: /store new value/i })
    expect(confirmButton).toBeDisabled()

    // A near-miss stays blocked: the phrase must match the credential being changed.
    fireEvent.change(within(dialog).getByLabelText(/type .stripe. to confirm/i), { target: { value: 'strip' } })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/type .stripe. to confirm/i), { target: { value: 'stripe' } })
    expect(confirmButton).toBeEnabled()
    fireEvent.click(confirmButton)

    // The write result is the only place the new version id is shown.
    await within(stripe).findByText(/stored and verified/i, {}, { timeout: 5000 })

    // The form is gone, and with it the only copy of the value.
    expect(within(stripe).queryByLabelText('Secret key')).toBeNull()

    const persisted = [
      ...Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? ''),
      ...Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key) ?? ''),
      window.location.href,
      document.body.textContent ?? '',
    ].join('\n')
    expect(persisted).not.toContain(NEW_STRIPE_KEY)
    expect(persisted).not.toContain(STRIPE_KEY_PREFIX)
  })

  it('forgets a typed phrase when the confirmation is dismissed', async () => {
    goTo('/admin/secrets')
    await signIn(SECRETS_ADMIN, /^secrets$/i)

    const stripe = (await screen.findByRole('heading', { name: 'Stripe' })).closest('section')!
    fireEvent.click(within(stripe).getByRole('button', { name: 'Rotate' }))
    fireEvent.change(within(stripe).getByLabelText('Secret key'), { target: { value: NEW_STRIPE_KEY } })
    fireEvent.click(within(stripe).getByRole('button', { name: /review and store/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/type .stripe. to confirm/i), { target: { value: 'stripe' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Reopening must start from an empty phrase — a carried-over match would wave the next one through.
    fireEvent.click(within(stripe).getByRole('button', { name: /review and store/i }))
    const reopened = await screen.findByRole('dialog')
    expect(within(reopened).getByLabelText(/type .stripe. to confirm/i)).toHaveValue('')
    expect(within(reopened).getByRole('button', { name: /store new value/i })).toBeDisabled()
  })

  it('rejects a malformed key without changing the stored fingerprint', async () => {
    goTo('/admin/secrets')
    await signIn(SECRETS_ADMIN, /^secrets$/i)

    const here = (await screen.findByRole('heading', { name: 'HERE Maps' })).closest('section')!
    const fingerprintBefore = detailValue(here, 'Stored fingerprint')

    fireEvent.click(within(here).getByRole('button', { name: 'Rotate' }))
    fireEvent.change(within(here).getByLabelText('API key'), { target: { value: 'too-short' } })
    fireEvent.click(within(here).getByRole('button', { name: /review and store/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/type .here. to confirm/i), { target: { value: 'here' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /store new value/i }))

    // The 422 names the field and the expected shape; it never echoes what was typed.
    const issue = await within(here).findByText(/expected a here rest api key/i, {}, { timeout: 5000 })
    expect(issue.textContent).not.toContain('too-short')
    expect(detailValue(here, 'Stored fingerprint')).toBe(fingerprintBefore)
  })

  it('pauses and resumes writes, blocking rotation while paused', async () => {
    goTo('/admin/secrets')
    await signIn(SECRETS_ADMIN, /^secrets$/i)

    fireEvent.click(await screen.findByRole('button', { name: /pause changes/i }))
    await screen.findByRole('heading', { name: /credential changes are paused/i }, { timeout: 5000 })

    const stripe = screen.getByRole('heading', { name: 'Stripe' }).closest('section')!
    await waitFor(() => expect(within(stripe).getByRole('button', { name: 'Rotate' })).toBeDisabled())
    // Reads keep working while writes are refused.
    within(stripe).getByText(/stored key matches the key in use/i)

    fireEvent.click(screen.getByRole('button', { name: /resume changes/i }))
    await screen.findByRole('heading', { name: /credential changes are enabled/i }, { timeout: 5000 })
    await waitFor(() => expect(within(stripe).getByRole('button', { name: 'Rotate' })).toBeEnabled())
  })

  it('rolls back to the previous key', async () => {
    goTo('/admin/secrets')
    await signIn(SECRETS_ADMIN, /^secrets$/i)

    const here = (await screen.findByRole('heading', { name: 'HERE Maps' })).closest('section')!
    const before = detailValue(here, 'Stored fingerprint')
    fireEvent.click(within(here).getByRole('button', { name: /roll back/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^roll back$/i }))

    await within(here).findByText(/new fingerprint/i, {}, { timeout: 5000 })
    await waitFor(() => expect(detailValue(here, 'Stored fingerprint')).not.toBe(before))
  })
})
