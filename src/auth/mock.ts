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
let pendingStaff: { email: string; mode: 'challenge' | 'enrollment' } | null = null

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
    pendingStaff = null
    if (mockStore.profileStatus(email) === 'none' || password.length < 12)
      throw new AuthFlowError('Wrong email or password.', 'invalid_credentials')
    if (mockStore.profileStatus(email) === 'unconfirmed')
      throw new AuthFlowError('Confirm your email first — check your inbox.', 'not_confirmed')
    if (
      mockStore.profileRole(email) !== 'buyer' &&
      mockStore.hasStaffMfa(email)
    )
      throw new AuthFlowError(
        'This account uses the designated staff sign-in page.',
        'staff_sign_in_required',
      )
    localStorage.setItem(SESSION_KEY, email)
    mockStore.signInAs(email)
  },

  async beginStaffSignIn(email, password) {
    await new Promise((r) => setTimeout(r, 600))
    localStorage.removeItem(SESSION_KEY)
    mockStore.clearSession()
    pendingStaff = null
    if (mockStore.profileStatus(email) !== 'confirmed' || password.length < 12)
      throw new AuthFlowError('Wrong email or password.', 'invalid_credentials')
    if (!['admin', 'restaurant_manager'].includes(mockStore.profileRole(email)))
      throw new AuthFlowError(
        'This account does not have access to the staff panel.',
        'staff_access_denied',
      )
    const mode = mockStore.hasStaffMfa(email) ? 'challenge' : 'enrollment'
    pendingStaff = { email, mode }
    return mode === 'challenge'
      ? ({ kind: 'totpChallenge' } as const)
      : ({ kind: 'totpEnrollment', secret: 'JBSWY3DPEHPK3PXP' } as const)
  },

  async confirmStaffMfa(code) {
    await new Promise((r) => setTimeout(r, 400))
    if (!pendingStaff) throw new AuthFlowError('Start staff sign-in again.', 'unknown')
    if (!/^\d{6}$/.test(code))
      throw new AuthFlowError('That authenticator code is wrong or expired.', 'mfa_code_mismatch')
    if (pendingStaff.mode === 'enrollment') mockStore.setStaffMfa(pendingStaff.email, true)
    localStorage.setItem(SESSION_KEY, pendingStaff.email)
    mockStore.signInAs(pendingStaff.email)
    pendingStaff = null
  },

  async cancelStaffSignIn() {
    pendingStaff = null
    localStorage.removeItem(SESSION_KEY)
    mockStore.clearSession()
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
    pendingStaff = null
    localStorage.removeItem(SESSION_KEY)
    mockStore.clearSession()
  },
}
