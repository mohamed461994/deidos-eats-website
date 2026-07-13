import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { resetMockApiForTests } from '@/api/mock/api'
import { DUBLIN_BRANCH_ID } from '@/api/mock/data'
import { mockStore } from '@/api/mock/store'
import { config } from '@/config'

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cXJjb2Rl'),
}))

const PASSWORD = 'a-long-password!'

function setField(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

async function submitStaffCredentials(email: string) {
  setField(/staff email/i, email)
  setField(/^password/i, PASSWORD)
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

async function completeAuthenticator(label: RegExp, button: RegExp) {
  const input = await screen.findByLabelText(label, {}, { timeout: 5000 })
  fireEvent.change(input, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: button }))
  await screen.findByRole('heading', { name: /online discounts/i }, { timeout: 5000 })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetMockApiForTests()
  window.history.pushState({}, '', config.staffSignInPath)
})

afterEach(() => cleanup())

describe('isolated staff sign-in and panel role gate', () => {
  it('enrolls a manager in TOTP before rendering the manager-only panel', async () => {
    const email = 'manager-enrol@example.ie'
    mockStore.seedStaffForTests(email, 'restaurant_manager', {
      branchIds: [DUBLIN_BRANCH_ID],
      mfaEnrolled: false,
    })

    render(<App />)
    await screen.findByLabelText(/staff email/i)
    await submitStaffCredentials(email)

    await screen.findByRole('heading', { name: /set up your authenticator/i }, { timeout: 5000 })
    expect(await screen.findByRole('img', { name: /qr code for authenticator enrollment/i })).toBeVisible()
    expect(screen.getByText(/JBSW Y3DP EHPK 3PXP/i)).toBeInTheDocument()

    await completeAuthenticator(/6-digit authenticator code/i, /confirm enrollment/i)
    expect(mockStore.hasStaffMfa(email)).toBe(true)
    expect(screen.getByRole('link', { name: 'Discounts' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Banners' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Restaurants' })).not.toBeInTheDocument()
  }, 20000)

  it('answers the MFA challenge and exposes every stubbed section only to admin', async () => {
    const email = 'admin@example.ie'
    mockStore.seedStaffForTests(email, 'admin', { mfaEnrolled: true })

    render(<App />)
    await screen.findByLabelText(/staff email/i)
    await submitStaffCredentials(email)

    expect(
      await screen.findByRole('heading', { name: /enter your authenticator code/i }, { timeout: 5000 }),
    ).toBeVisible()
    expect(screen.queryByText(/set up your authenticator/i)).not.toBeInTheDocument()
    await completeAuthenticator(/6-digit authenticator code/i, /verify and open panel/i)

    for (const label of [
      'Discounts',
      'Banners',
      'From the oven',
      'Text & links',
      'Restaurants',
      'Branches',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeVisible()
    }
  }, 20000)

  it('rejects a privileged account on buyer /signin without exposing the MFA challenge', async () => {
    const email = 'wrong-door@example.ie'
    mockStore.seedStaffForTests(email, 'admin', { mfaEnrolled: true })
    window.history.pushState({}, '', '/signin')

    render(<App />)
    await screen.findByLabelText(/^email/i)
    setField(/^email/i, email)
    setField(/^password/i, PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(
      await screen.findByText(/designated staff sign-in page/i, {}, { timeout: 5000 }),
    ).toBeVisible()
    expect(screen.queryByLabelText(/authenticator code/i)).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/signin')
    expect(localStorage.getItem('puca-mock-session-v1')).toBeNull()
  }, 10000)

  it('immediately discards an unenrolled privileged session created through buyer /signin', async () => {
    const email = 'unenrolled-wrong-door@example.ie'
    mockStore.seedStaffForTests(email, 'restaurant_manager', {
      branchIds: [DUBLIN_BRANCH_ID],
      mfaEnrolled: false,
    })
    window.history.pushState({}, '', '/signin')

    render(<App />)
    await screen.findByLabelText(/^email/i)
    setField(/^email/i, email)
    setField(/^password/i, PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(
      await screen.findByText(/designated staff sign-in page/i, {}, { timeout: 5000 }),
    ).toBeVisible()
    expect(localStorage.getItem('puca-mock-session-v1')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Discounts' })).not.toBeInTheDocument()
  }, 10000)

  it('rejects ordinary restaurant staff on buyer /signin with the same generic message', async () => {
    const email = 'ordinary-staff-wrong-door@example.ie'
    mockStore.seedStaffForTests(email, 'restaurant_staff', { mfaEnrolled: true })
    window.history.pushState({}, '', '/signin')

    render(<App />)
    await screen.findByLabelText(/^email/i)
    setField(/^email/i, email)
    setField(/^password/i, PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(
      await screen.findByText(/designated staff sign-in page/i, {}, { timeout: 5000 }),
    ).toBeVisible()
    expect(localStorage.getItem('puca-mock-session-v1')).toBeNull()
  }, 10000)

  it('does not let a next parameter escape the exact admin route namespace', async () => {
    const email = 'safe-next-admin@example.ie'
    mockStore.seedStaffForTests(email, 'admin', { mfaEnrolled: true })
    window.history.pushState(
      {},
      '',
      `${config.staffSignInPath}?next=${encodeURIComponent('/administrator')}`,
    )

    render(<App />)
    await screen.findByLabelText(/staff email/i)
    await submitStaffCredentials(email)
    await completeAuthenticator(/6-digit authenticator code/i, /verify and open panel/i)

    expect(window.location.pathname).toBe('/admin/discounts')
    expect(screen.getByRole('link', { name: 'Discounts' })).toBeVisible()
  }, 20000)

  it('does not let a manager open an admin-only route directly', async () => {
    const email = 'scoped-manager@example.ie'
    mockStore.seedStaffForTests(email, 'restaurant_manager', {
      branchIds: [DUBLIN_BRANCH_ID],
      mfaEnrolled: true,
    })

    render(<App />)
    await screen.findByLabelText(/staff email/i)
    await submitStaffCredentials(email)
    await completeAuthenticator(/6-digit authenticator code/i, /verify and open panel/i)

    window.history.pushState({}, '', '/admin/banners')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(window.location.pathname).toBe('/admin/discounts'))
    expect(screen.queryByRole('heading', { name: 'Banners' })).not.toBeInTheDocument()
  }, 20000)
})
