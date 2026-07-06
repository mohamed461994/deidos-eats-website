/**
 * MOCK auth — no Cognito, no network. Mirrors the real pool's rules where it
 * matters for UX (12-char minimum password, email confirmation step) so the
 * flows exercise the same states the live SRP flow produces:
 * - sign-in works only for accounts CREATED AND CONFIRMED in this browser
 *   (unknown email → "wrong email or password", like preventUserExistenceErrors;
 *   unconfirmed → 'not_confirmed', which the sign-in page routes to the code step);
 * - signing up an already-confirmed email fails like UsernameExistsException.
 *
 * Identity is per-account: SESSION_KEY holds the signed-in email and the store
 * keeps a profile + address book keyed by that email. There is NO hardcoded
 * demo persona — name/phone/addresses always come from the signed-in account.
 */
import { mockStore } from '@/api/mock/store'

import { AuthFlowError, type AuthProvider, type SignUpResult } from './provider'

const SESSION_KEY = 'puca-mock-session-v1'

export const mockAuthProvider: AuthProvider = {
  async getAccessToken() {
    return localStorage.getItem(SESSION_KEY) ? 'mock-access-token' : undefined
  },

  async restoreSession() {
    const email = localStorage.getItem(SESSION_KEY)
    if (!email) return null
    // Rebind the store to the restored session so /me returns this account.
    mockStore.signInAs(email)
    return email
  },

  async signIn(email, password) {
    await new Promise((r) => setTimeout(r, 600))
    if (mockStore.profileStatus(email) === 'none' || password.length < 12)
      throw new AuthFlowError('Wrong email or password.', 'invalid_credentials')
    if (mockStore.profileStatus(email) === 'unconfirmed')
      throw new AuthFlowError('Confirm your email first — check your inbox.', 'not_confirmed')
    localStorage.setItem(SESSION_KEY, email)
    mockStore.signInAs(email)
  },

  async signUp(email, password, fullName): Promise<SignUpResult> {
    await new Promise((r) => setTimeout(r, 600))
    if (password.length < 12)
      throw new AuthFlowError('Password must be at least 12 characters.', 'password_policy')
    if (mockStore.profileStatus(email) === 'confirmed')
      throw new AuthFlowError('An account with this email already exists.', 'user_exists')
    // Persist the full name against the email so it survives confirm → sign-in
    // (the mock's stand-in for Cognito storing the `name` attribute at signup).
    // Re-signup of an abandoned (unconfirmed) signup just refreshes the record.
    mockStore.registerSignup(email, fullName)
    return { needsConfirmation: true }
  },

  async confirmSignUp(email, code) {
    await new Promise((r) => setTimeout(r, 600))
    if (!/^\d{6}$/.test(code))
      throw new AuthFlowError('That code doesn’t look right — it’s the 6 digits from your email.', 'code_mismatch')
    if (mockStore.profileStatus(email) === 'none')
      throw new AuthFlowError('Start by creating an account.', 'unknown')
    // Like real Cognito, confirming does NOT create a session; the caller signs
    // in next.
    mockStore.markConfirmed(email)
  },

  async resendConfirmationCode() {
    // No real email to send in mock mode — just simulate the network round-trip.
    await new Promise((r) => setTimeout(r, 400))
  },

  async signOut() {
    localStorage.removeItem(SESSION_KEY)
    mockStore.clearSession()
  },
}
