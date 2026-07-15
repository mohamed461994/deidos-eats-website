import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { DUBLIN_BRANCH_ID, RESTAURANT_A_ID } from '@/api/mock/data'
import { resetMockApiForTests } from '@/api/mock/api'
import { mockStore } from '@/api/mock/store'
import { config } from '@/config'

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cXJjb2Rl'),
}))

const EMAIL = 'admin-content@example.ie'
const PASSWORD = 'a-long-password!'
const PNG_BYTES = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0,
  1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248,
  207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78,
  68, 174, 66, 96, 130,
])

function setField(label: string, value: string, root: Pick<typeof screen, 'getByLabelText'> = screen) {
  fireEvent.change(root.getByLabelText(label), { target: { value } })
}

function navigate(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

async function signInAdmin() {
  render(<App />)
  await screen.findByLabelText('Staff email')
  setField('Staff email', EMAIL)
  setField('Password', PASSWORD)
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  const code = await screen.findByLabelText('6-digit authenticator code', {}, { timeout: 5000 })
  fireEvent.change(code, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify and open panel' }))
  await screen.findByRole('heading', { name: 'Online discounts' }, { timeout: 5000 })
}

async function openAdminScreen(path: string, heading: string) {
  navigate(path)
  await screen.findByRole('heading', { name: heading }, { timeout: 5000 })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetMockApiForTests()
  mockStore.seedStaffForTests(EMAIL, 'admin', { mfaEnrolled: true })
  window.history.pushState({}, '', config.staffSignInPath)
  vi.stubGlobal('createImageBitmap', vi.fn())
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:admin-preview') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})

afterEach(() => cleanup())

describe('admin content and onboarding screens', () => {
  it('sets a store URL through typed content and surfaces the home badge only after save', async () => {
    await signInAdmin()
    await openAdminScreen('/admin/content', 'Text & links')

    const input = await screen.findByLabelText('App Store URL', {}, { timeout: 5000 })
    const form = input.closest('form')
    if (!form) throw new Error('App Store content form not found')
    fireEvent.change(input, { target: { value: 'https://apps.apple.com/ie/app/deidos-eats/id123' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await screen.findByText('App Store URL saved.', {}, { timeout: 5000 })

    navigate('/')
    expect(await screen.findByRole('link', { name: /app store/i }, { timeout: 5000 })).toBeVisible()
    expect(screen.queryByRole('link', { name: /google play/i })).toBeNull()
  }, 20000)

  it('creates a scheduled, branch-scoped banner with a temporary upload and a branch menu oven pick', async () => {
    await signInAdmin()
    await openAdminScreen('/admin/banners', 'Banners')
    fireEvent.click(screen.getByRole('button', { name: 'New banner' }))
    setField('Title', 'Summer service')
    await screen.findByRole('option', { name: 'Deidos Grill' }, { timeout: 5000 })
    fireEvent.change(screen.getByLabelText('Geo scope'), { target: { value: RESTAURANT_A_ID } })
    await screen.findByRole('option', { name: 'Ranelagh' }, { timeout: 5000 })
    fireEvent.change(screen.getByLabelText('Branch scope'), { target: { value: DUBLIN_BRANCH_ID } })
    setField('Start (optional)', '2030-06-01T12:00')
    const upload = screen.getByLabelText('Choose image')
    fireEvent.change(upload, { target: { files: [new File([PNG_BYTES], 'summer.png', { type: 'image/png' })] } })
    await screen.findByLabelText('Replace image', {}, { timeout: 5000 })
    expect(document.querySelector('img[src="blob:admin-preview"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create banner' }))
    expect(await screen.findByText('Banner created.', {}, { timeout: 5000 })).toBeVisible()
    expect(await screen.findByText('Summer service', {}, { timeout: 5000 })).toBeVisible()
    expect(screen.getByText(/branch scoped/i)).toBeVisible()

    const bannerCard = screen.getByRole('heading', { name: 'Summer service' }).closest('li')
    if (!bannerCard) throw new Error('Created banner card not found')
    fireEvent.click(within(bannerCard).getByRole('button', { name: 'Edit' }))
    setField('Title', 'Autumn service')
    fireEvent.click(screen.getByRole('button', { name: 'Save banner' }))
    expect(await screen.findByText('Autumn service', {}, { timeout: 5000 })).toBeVisible()

    await openAdminScreen('/admin/oven', 'From the oven')
    fireEvent.click(screen.getByRole('button', { name: 'New pick' }))
    fireEvent.change(screen.getByLabelText('Restaurant'), { target: { value: RESTAURANT_A_ID } })
    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: DUBLIN_BRANCH_ID } })
    await waitFor(() => expect(screen.getByLabelText('Menu item')).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText('Menu item'), { target: { value: `i-house-${DUBLIN_BRANCH_ID}` } })
    setField('Blurb (optional)', 'A favourite from the charcoal grill.')
    fireEvent.click(screen.getByRole('button', { name: 'Create pick' }))
    expect(await screen.findByText('Oven pick created.', {}, { timeout: 5000 })).toBeVisible()
    expect(screen.getByText('A favourite from the charcoal grill.')).toBeVisible()
  }, 30000)

  it('creates a draft restaurant and branch, then surfaces the API publication-readiness gate', async () => {
    await signInAdmin()
    await openAdminScreen('/admin/restaurants', 'Restaurants')
    fireEvent.click(screen.getByRole('button', { name: 'New restaurant' }))
    setField('Restaurant name', 'Gate Test Kitchen')
    setField('Website slug', 'gate-test-kitchen')
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(await screen.findByText(/draft restaurant created/i, {}, { timeout: 5000 })).toBeVisible()
    await screen.findByRole('heading', { name: 'Edit Gate Test Kitchen' }, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await openAdminScreen('/admin/branches', 'Branches')
    fireEvent.click(screen.getByRole('button', { name: 'New branch' }))
    const option = screen.getByRole('option', { name: 'Gate Test Kitchen · Draft' })
    const restaurantId = option.getAttribute('value')
    if (!restaurantId) throw new Error('Created restaurant option does not have an id')
    fireEvent.change(screen.getByLabelText('Restaurant'), { target: { value: restaurantId } })
    setField('Branch name', 'Gate Test Branch')
    setField('Address line 1', '1 Test Lane')
    setField('Town', 'Dublin')
    setField('County', 'Dublin')
    setField('Eircode', 'D02 X285')
    fireEvent.click(screen.getByRole('button', { name: 'Create branch' }))
    expect(await screen.findByText(/branch created/i, {}, { timeout: 5000 })).toBeVisible()
    await screen.findByRole('heading', { name: 'Edit Gate Test Branch' }, { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await openAdminScreen('/admin/restaurants', 'Restaurants')
    const restaurantCard = screen.getByRole('heading', { name: 'Gate Test Kitchen' }).closest('li')
    if (!restaurantCard) throw new Error('Created restaurant card not found')
    fireEvent.click(within(restaurantCard).getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText(/publishing makes this visible on the website and every installed ios build/i)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Publish restaurant' }))
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent('Gate Test Branch')
    expect(screen.getByText(/membership assignment is an ops step/i)).toBeVisible()
  }, 30000)

  it('keeps dashboard-configured tiered delivery pricing across an admin branch edit', async () => {
    await signInAdmin()
    await openAdminScreen('/admin/branches', 'Branches')

    const branchCard = (await screen.findByRole('heading', { name: 'Ranelagh' }, { timeout: 5000 })).closest('li')
    if (!branchCard) throw new Error('Ranelagh branch card not found')
    fireEvent.click(within(branchCard).getByRole('button', { name: 'Edit branch' }))
    expect(await screen.findByLabelText('Base radius (km)')).toHaveValue('2')
    expect(screen.getByLabelText('Per extra km (€)')).toHaveValue('0.80')

    setField('Branch name', 'Ranelagh Corner')
    fireEvent.click(screen.getByRole('button', { name: 'Save branch' }))
    expect(await screen.findByText('Branch saved.', {}, { timeout: 5000 })).toBeVisible()

    const renamedCard = (await screen.findByRole('heading', { name: 'Ranelagh Corner' }, { timeout: 5000 })).closest('li')
    if (!renamedCard) throw new Error('Renamed branch card not found')
    fireEvent.click(within(renamedCard).getByRole('button', { name: 'Edit branch' }))
    expect(await screen.findByLabelText('Base radius (km)')).toHaveValue('2')
    expect(screen.getByLabelText('Per extra km (€)')).toHaveValue('0.80')
  }, 30000)

  it('rejects a banner link that is neither https nor a site path', async () => {
    await signInAdmin()
    await openAdminScreen('/admin/banners', 'Banners')
    fireEvent.click(screen.getByRole('button', { name: 'New banner' }))
    setField('Title', 'Unsafe link banner')
    setField('Link (optional)', 'javascript:alert(1)')
    fireEvent.click(screen.getByRole('button', { name: 'Create banner' }))

    expect(await screen.findByText(/https:\/\/ URL or a site path/i)).toBeVisible()
    expect(screen.queryByText('Banner created.')).toBeNull()
  }, 20000)

  it('explains an invalid restaurant slug next to the field before submitting', async () => {
    await signInAdmin()
    await openAdminScreen('/admin/restaurants', 'Restaurants')
    fireEvent.click(screen.getByRole('button', { name: 'New restaurant' }))
    setField('Restaurant name', 'Coastal Kitchen')
    setField('Website slug', 'coastal kitchen!')
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))

    expect(await screen.findByText(/lowercase words separated by single hyphens/i)).toBeVisible()
    expect(screen.getByLabelText('Website slug')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Some details look off — check the highlighted fields.')).toBeNull()
  }, 20000)

  it('explains an invalid branch Eircode next to the field before submitting', async () => {
    await signInAdmin()
    await openAdminScreen('/admin/branches', 'Branches')
    fireEvent.click(screen.getByRole('button', { name: 'New branch' }))
    fireEvent.change(screen.getByLabelText('Restaurant'), { target: { value: RESTAURANT_A_ID } })
    setField('Branch name', 'Eircode Test Branch')
    setField('Address line 1', '1 Test Lane')
    setField('Town', 'Dublin')
    setField('County', 'Dublin')
    setField('Eircode', 'not-an-eircode')
    fireEvent.click(screen.getByRole('button', { name: 'Create branch' }))

    expect(await screen.findByText(/valid irish eircode/i)).toBeVisible()
    expect(screen.getByLabelText('Eircode')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Some details look off — check the highlighted fields.')).toBeNull()
  }, 20000)

  it('requires a confirmation for the publish, pause, and archive lifecycle actions', async () => {
    await signInAdmin()
    await openAdminScreen('/admin/restaurants', 'Restaurants')

    const draftCard = (await screen.findByRole('heading', { name: 'Harbour Kitchen' }, { timeout: 5000 })).closest('li')
    if (!draftCard) throw new Error('Draft restaurant card not found')
    expect(within(draftCard).getByText('Draft')).toBeVisible()
    fireEvent.click(within(draftCard).getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText(/publishing makes this visible/i)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Publish restaurant' }))
    expect(await screen.findByText('Restaurant published.', {}, { timeout: 5000 })).toBeVisible()

    const publishedCard = screen.getByRole('heading', { name: 'Harbour Kitchen' }).closest('li')
    if (!publishedCard) throw new Error('Published restaurant card not found')
    fireEvent.click(within(publishedCard).getByRole('button', { name: 'Pause' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pause restaurant' }))
    expect(await screen.findByText('Restaurant paused.', {}, { timeout: 5000 })).toBeVisible()

    const pausedCard = screen.getByRole('heading', { name: 'Harbour Kitchen' }).closest('li')
    if (!pausedCard) throw new Error('Paused restaurant card not found')
    fireEvent.click(within(pausedCard).getByRole('button', { name: 'Archive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive restaurant' }))
    expect(await screen.findByText('Restaurant archived.', {}, { timeout: 5000 })).toBeVisible()
    const archivedCard = screen.getByRole('heading', { name: 'Harbour Kitchen' }).closest('li')
    if (!archivedCard) throw new Error('Archived restaurant card not found')
    expect(within(archivedCard).getByText('Archived', { selector: 'span' })).toBeVisible()
  }, 30000)
})
