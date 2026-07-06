/**
 * Per-account identity contract for the mock. The load-bearing rules (mirroring
 * the real API + iOS ProfileViewModel): /me is a first-login sync keyed to the
 * signed-in account, the signup name survives confirm → sign-in, PATCH /me
 * persists, a fresh account has an EMPTY address book, and no account ever sees
 * another account's profile or addresses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockAuthProvider } from '@/auth/mock'

import { mockStore } from './store'

import { createMyAddress, getMe, listMyAddresses, updateMe } from './api'

const PASSWORD = 'a-long-password!'

async function settle<T>(promise: Promise<T>, ms = 2000): Promise<T> {
  // Attach a handler before advancing timers so an early rejection isn't "unhandled"
  promise.catch(() => {})
  await vi.advanceTimersByTimeAsync(ms)
  return promise
}

beforeEach(async () => {
  vi.useFakeTimers()
  localStorage.clear()
  mockStore.resetForTests()
  // Reset the in-memory session so each test starts signed out.
  await mockAuthProvider.signOut()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mock identity', () => {
  it('carries the signup name through confirm → sign-in and back from getMe', async () => {
    const email = 'niamh@puca.ie'
    await settle(mockAuthProvider.signUp(email, PASSWORD, 'Niamh Kelly'))
    await settle(mockAuthProvider.confirmSignUp(email, '123456'))
    await settle(mockAuthProvider.signIn(email, PASSWORD))

    const me = await settle(getMe())
    expect(me.email).toBe(email)
    expect(me.fullName).toBe('Niamh Kelly')
    expect(me.phone).toBeNull()
  })

  it('refuses sign-in for an email that never signed up (like real Cognito)', async () => {
    await expect(
      settle(mockAuthProvider.signIn('walkin.customer@puca.ie', PASSWORD)),
    ).rejects.toMatchObject({ code: 'invalid_credentials' })
  })

  it('refuses sign-in until the email is confirmed', async () => {
    const email = 'unverified@puca.ie'
    await settle(mockAuthProvider.signUp(email, PASSWORD, 'Una Verified'))

    await expect(settle(mockAuthProvider.signIn(email, PASSWORD))).rejects.toMatchObject({
      code: 'not_confirmed',
    })

    await settle(mockAuthProvider.confirmSignUp(email, '123456'))
    await expect(settle(mockAuthProvider.signIn(email, PASSWORD))).resolves.toBeUndefined()
  })

  it('refuses signing up an email that already has a confirmed account', async () => {
    const email = 'taken@puca.ie'
    await settle(mockAuthProvider.signUp(email, PASSWORD, 'First Owner'))
    await settle(mockAuthProvider.confirmSignUp(email, '123456'))

    await expect(
      settle(mockAuthProvider.signUp(email, PASSWORD, 'Second Owner')),
    ).rejects.toMatchObject({ code: 'user_exists' })
  })

  it('persists PATCH /me phone (and name) across getMe calls', async () => {
    await settle(mockAuthProvider.signUp('cara@puca.ie', PASSWORD, 'Cara'))
    await settle(mockAuthProvider.confirmSignUp('cara@puca.ie', '123456'))
    await settle(mockAuthProvider.signIn('cara@puca.ie', PASSWORD))

    const updated = await settle(updateMe({ fullName: 'Cara Nolan', phone: '+353 87 1234567' }))
    expect(updated.fullName).toBe('Cara Nolan')
    expect(updated.phone).toBe('+353 87 1234567')

    const me = await settle(getMe())
    expect(me.fullName).toBe('Cara Nolan')
    expect(me.phone).toBe('+353 87 1234567')
  })

  it('gives a fresh account an empty address book', async () => {
    await settle(mockAuthProvider.signUp('fresh@puca.ie', PASSWORD, 'Fresh Account'))
    await settle(mockAuthProvider.confirmSignUp('fresh@puca.ie', '123456'))
    await settle(mockAuthProvider.signIn('fresh@puca.ie', PASSWORD))
    const addresses = await settle(listMyAddresses())
    expect(addresses).toEqual([])
  })

  it('never leaks one account’s profile or addresses to another', async () => {
    // Account A: named at signup, saves an address, sets a phone.
    const a = 'aoife@puca.ie'
    await settle(mockAuthProvider.signUp(a, PASSWORD, 'Aoife Byrne'))
    await settle(mockAuthProvider.confirmSignUp(a, '123456'))
    await settle(mockAuthProvider.signIn(a, PASSWORD))
    await settle(updateMe({ phone: '+353 1 5550000' }))
    await settle(
      createMyAddress({
        label: 'Home',
        line1: '12 Charleston Avenue',
        town: 'Ranelagh, Dublin 6',
        county: 'Dublin',
        eircode: 'D06 C7W2',
        isDefault: true,
      }),
    )

    // Switch to a brand-new account B.
    await settle(mockAuthProvider.signOut())
    const b = 'brendan@puca.ie'
    await settle(mockAuthProvider.signUp(b, PASSWORD, 'Brendan Walsh'))
    await settle(mockAuthProvider.confirmSignUp(b, '123456'))
    await settle(mockAuthProvider.signIn(b, PASSWORD))

    const meB = await settle(getMe())
    expect(meB.email).toBe(b)
    // B sees its own signup identity — never A's profile data.
    expect(meB.fullName).toBe('Brendan Walsh')
    expect(meB.phone).toBeNull()
    expect(await settle(listMyAddresses())).toEqual([])

    // Sign back into A — its data is intact and distinct from B's.
    await settle(mockAuthProvider.signOut())
    await settle(mockAuthProvider.signIn(a, PASSWORD))
    const meA = await settle(getMe())
    expect(meA.fullName).toBe('Aoife Byrne')
    expect(meA.phone).toBe('+353 1 5550000')
    expect(meA.id).not.toBe(meB.id)
    const addressesA = await settle(listMyAddresses())
    expect(addressesA).toHaveLength(1)
    expect(addressesA[0].label).toBe('Home')
  })
})
