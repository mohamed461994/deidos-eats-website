/**
 * Confirm-flow contract at the provider level. The load-bearing rule: confirming
 * an account does NOT establish a session (mirrors real Cognito's
 * confirmRegistration) — the caller must sign in afterwards to get a token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockStore } from '@/api/mock/store'

import { mockAuthProvider } from './mock'

const EMAIL = 'new@puca.ie'
const PASSWORD = 'a-long-password!'

async function settle<T>(promise: Promise<T>, ms = 2000): Promise<T> {
  // Attach a handler before advancing timers so an early rejection isn't "unhandled"
  promise.catch(() => {})
  await vi.advanceTimersByTimeAsync(ms)
  return promise
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  mockStore.resetForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mock confirm flow', () => {
  it('confirming an account alone does not create a session', async () => {
    await settle(mockAuthProvider.signUp(EMAIL, PASSWORD, 'New User'))
    await settle(mockAuthProvider.confirmSignUp(EMAIL, '123456'))
    expect(await mockAuthProvider.getAccessToken()).toBeUndefined()
  })

  it('signing in after confirm establishes the session', async () => {
    await settle(mockAuthProvider.signUp(EMAIL, PASSWORD, 'New User'))
    await settle(mockAuthProvider.confirmSignUp(EMAIL, '123456'))
    await settle(mockAuthProvider.signIn(EMAIL, PASSWORD))
    expect(await mockAuthProvider.getAccessToken()).toBe('mock-access-token')
  })

  it('rejects a malformed confirmation code', async () => {
    await settle(mockAuthProvider.signUp(EMAIL, PASSWORD, 'New User'))
    await expect(settle(mockAuthProvider.confirmSignUp(EMAIL, 'abc'))).rejects.toMatchObject({
      code: 'code_mismatch',
    })
  })

  it('resends a confirmation code without error', async () => {
    await expect(settle(mockAuthProvider.resendConfirmationCode(EMAIL))).resolves.toBeUndefined()
  })
})
