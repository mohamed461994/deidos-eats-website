import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { resetMockApiForTests } from '@/api/mock/api'
import { DUBLIN_BRANCH_ID } from '@/api/mock/data'
import { mockStore } from '@/api/mock/store'
import { config } from '@/config'

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cXJjb2Rl'),
}))

const ADMIN_EMAIL = 'platform-admin@example.ie'
const PASSWORD = 'a-long-password!'

function setField(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

async function signInAdminToStaff() {
  render(<App />)
  await screen.findByLabelText(/staff email/i)
  setField(/staff email/i, ADMIN_EMAIL)
  setField(/^password/i, PASSWORD)
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  const code = await screen.findByLabelText(/6-digit authenticator code/i, {}, { timeout: 5000 })
  fireEvent.change(code, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: /verify and open panel/i }))
  await screen.findByRole('heading', { name: 'Staff' }, { timeout: 5000 })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetMockApiForTests()
  mockStore.seedStaffForTests(ADMIN_EMAIL, 'admin', { mfaEnrolled: true })
  window.history.pushState({}, '', `${config.staffSignInPath}?next=${encodeURIComponent('/admin/staff')}`)
})

afterEach(() => cleanup())

describe('admin staff panel', () => {
  it('creates an account, reveals the temp password once, then disables it', async () => {
    await signInAdminToStaff()

    // Open the create editor (enabled once the branch list has loaded).
    const openButton = await screen.findByRole('button', { name: /new account/i })
    await waitFor(() => expect(openButton).toBeEnabled())
    fireEvent.click(openButton)

    setField(/^email/i, 'newkitchen@example.ie')
    await waitFor(() => {
      const branch = screen.getByLabelText('Branch') as HTMLSelectElement
      expect(branch.options.length).toBeGreaterThan(1)
    })
    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: DUBLIN_BRANCH_ID } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // The one-time password modal appears with a non-empty secret.
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 })
    within(dialog).getByText(/temporary password/i)
    within(dialog).getByText(/shown once/i)
    const code = dialog.querySelector('code')
    expect(code?.textContent?.length ?? 0).toBeGreaterThan(10)
    fireEvent.click(within(dialog).getByRole('button', { name: /i.?ve saved it/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // The account now shows in the list, tagged as a kitchen role.
    await screen.findByText('newkitchen@example.ie')
    expect(screen.getAllByText('Kitchen').length).toBeGreaterThan(0)

    // Disable it (the only member → the only Disable button) and confirm the badge flips.
    fireEvent.click(screen.getByRole('button', { name: /^disable$/i }))
    const confirmDialog = await screen.findByRole('dialog')
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /disable account/i }))
    await screen.findByText('Disabled', {}, { timeout: 5000 })
  }, 20000)
})
