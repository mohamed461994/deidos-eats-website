import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { isApiError } from '@/api'
import { adminApi } from '@/api/admin-api'
import {
  bumpMockPromoTokenForTests,
  resetMockApiForTests,
} from '@/api/mock/api'
import { CORK_BRANCH_ID, DUBLIN_BRANCH_ID } from '@/api/mock/data'
import { mockStore } from '@/api/mock/store'
import { config } from '@/config'

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cXJjb2Rl'),
}))

const EMAIL = 'discount-manager@example.ie'
const PASSWORD = 'a-long-password!'

function setField(
  label: RegExp | string,
  value: string,
  root: Pick<typeof screen, 'getByLabelText'> = screen,
) {
  fireEvent.change(root.getByLabelText(label), { target: { value } })
}

async function signInManager() {
  render(<App />)
  await screen.findByLabelText(/staff email/i)
  setField(/staff email/i, EMAIL)
  setField(/^password/i, PASSWORD)
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  const code = await screen.findByLabelText(/6-digit authenticator code/i, {}, { timeout: 5000 })
  fireEvent.change(code, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: /verify and open panel/i }))
  await screen.findByRole('heading', { name: /online discounts/i }, { timeout: 5000 })
  await screen.findByRole('heading', { name: /Ranelagh catalog/i }, { timeout: 5000 })
}

function rowNamed(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li')
  if (!row) throw new Error(`Catalog row not found for ${name}`)
  return row
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetMockApiForTests()
  mockStore.seedStaffForTests(EMAIL, 'restaurant_manager', {
    branchIds: [DUBLIN_BRANCH_ID],
    mfaEnrolled: true,
  })
  window.history.pushState({}, '', config.staffSignInPath)
})

afterEach(() => cleanup())

describe('scoped raw promo catalog', () => {
  it('offers only a manager membership branch and rejects another branch read', async () => {
    await signInManager()

    const branchSelect = screen.getByLabelText('Branch') as HTMLSelectElement
    expect(branchSelect.options).toHaveLength(1)
    expect(branchSelect.options[0]).toHaveTextContent(/Deidos Grill · Ranelagh/i)

    await expect(adminApi.getStaffBranchMenuCatalog(CORK_BRANCH_ID)).rejects.toSatisfy(
      (error: unknown) => isApiError(error) && error.status === 403,
    )
  }, 20000)

  it('lets an admin select and read any branch through the dedicated promo policy', async () => {
    localStorage.clear()
    sessionStorage.clear()
    resetMockApiForTests()
    mockStore.seedStaffForTests(EMAIL, 'admin', { mfaEnrolled: true })

    await signInManager()
    const branchSelect = screen.getByLabelText('Branch') as HTMLSelectElement
    expect(branchSelect.options.length).toBeGreaterThan(1)
    fireEvent.change(branchSelect, { target: { value: CORK_BRANCH_ID } })
    expect(
      await screen.findByRole('heading', { name: /Washington Street catalog/i }, { timeout: 5000 }),
    ).toBeVisible()
  }, 20000)

  it('keeps scheduled and expired raw promos visible after a panel reload', async () => {
    await signInManager()
    expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0)

    cleanup()
    window.history.pushState({}, '', '/admin/discounts')
    render(<App />)

    await screen.findByRole('heading', { name: /Ranelagh catalog/i }, { timeout: 5000 })
    expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0)
  }, 20000)

  it('updates, reschedules, refetches, and then clears the server raw state', async () => {
    await signInManager()

    let row = rowNamed('The Classic')
    fireEvent.click(within(row).getByRole('button', { name: /edit \/ reschedule for the classic/i }))
    setField(/online price/i, '8.50', within(row))
    setField(/starts/i, '2030-02-01T12:00', within(row))
    setField(/ends/i, '2030-02-10T12:00', within(row))
    fireEvent.click(within(row).getByRole('button', { name: /save online promo/i }))

    await screen.findByText('Online promo saved.', {}, { timeout: 5000 })
    row = rowNamed('The Classic')
    expect(within(row).getByText('€8.50')).toBeVisible()
    expect(within(row).getByText('Scheduled')).toBeVisible()

    // Re-open only after the post-mutation catalog refetch. The editor is keyed by the
    // new updatedAt token and must show the server's rescheduled values.
    fireEvent.click(within(row).getByRole('button', { name: /edit \/ reschedule for the classic/i }))
    expect(within(row).getByLabelText(/online price/i)).toHaveValue('8.50')
    expect(within(row).getByLabelText(/starts/i)).toHaveValue('2030-02-01T12:00')
    expect(within(row).getByLabelText(/ends/i)).toHaveValue('2030-02-10T12:00')
    fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }))

    fireEvent.click(within(row).getByRole('button', { name: /clear promo for the classic/i }))
    fireEvent.click(within(row).getByRole('button', { name: /^clear promo$/i }))
    await screen.findByText('Online promo cleared.', {}, { timeout: 5000 })

    row = rowNamed('The Classic')
    expect(within(row).getByText('No promo')).toBeVisible()
    expect(within(row).queryByText('€8.50')).not.toBeInTheDocument()
  }, 30000)

  it('reloads the latest catalog and closes a stale editor after a 409 conflict', async () => {
    await signInManager()

    const row = rowNamed('Double Stack')
    fireEvent.click(within(row).getByRole('button', { name: /edit \/ reschedule for double stack/i }))
    setField(/online price/i, '9.00', within(row))
    bumpMockPromoTokenForTests(`i-double-${DUBLIN_BRANCH_ID}`)
    fireEvent.click(within(row).getByRole('button', { name: /save online promo/i }))

    expect(
      await screen.findByText(/changed after you opened it.*latest catalog is loaded/i, {}, { timeout: 5000 }),
    ).toBeVisible()
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: /edit online promo for double stack/i })).not.toBeInTheDocument(),
    )
  }, 20000)
})
