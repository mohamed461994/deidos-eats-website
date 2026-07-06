/**
 * MOCK auth — no Cognito, no network. Mirrors the real pool's rules where it
 * matters for UX (12-char minimum password, email confirmation step) so the
 * flows exercise the same states the live SRP flow produces.
 */
import { mockStore } from '@/api/mock/store'
import type { User } from '@/api/types'

import { AuthFlowError, type AuthProvider, type SignUpResult } from './provider'

const SESSION_KEY = 'puca-mock-session-v1'
const PENDING_KEY = 'puca-mock-pending-signup-v1'

function buyerUser(email: string, fullName: string | null): User {
  return {
    id: 'u0000000-0000-4000-8000-000000000001',
    email,
    fullName,
    phone: null,
    role: 'buyer',
    createdAt: new Date().toISOString(),
  }
}

export const mockAuthProvider: AuthProvider = {
  async getAccessToken() {
    return localStorage.getItem(SESSION_KEY) ? 'mock-access-token' : undefined
  },

  async restoreSession() {
    const email = localStorage.getItem(SESSION_KEY)
    if (!email) return null
    if (!mockStore.user) mockStore.setUser(buyerUser(email, 'Aoife Byrne'))
    return email
  },

  async signIn(email, password) {
    await new Promise((r) => setTimeout(r, 600))
    if (password.length < 12)
      throw new AuthFlowError(
        'Password must be at least 12 characters.',
        'invalid_credentials',
      )
    localStorage.setItem(SESSION_KEY, email)
    if (!mockStore.user || mockStore.user.email !== email) {
      mockStore.setUser(buyerUser(email, mockStore.user?.fullName ?? 'Aoife Byrne'))
    }
  },

  async signUp(email, password, fullName): Promise<SignUpResult> {
    await new Promise((r) => setTimeout(r, 600))
    if (password.length < 12)
      throw new AuthFlowError('Password must be at least 12 characters.', 'password_policy')
    localStorage.setItem(PENDING_KEY, JSON.stringify({ email, fullName }))
    return { needsConfirmation: true }
  },

  async confirmSignUp(email, code) {
    await new Promise((r) => setTimeout(r, 600))
    if (!/^\d{6}$/.test(code))
      throw new AuthFlowError('That code doesn’t look right — it’s the 6 digits from your email.', 'code_mismatch')
    const pendingRaw = localStorage.getItem(PENDING_KEY)
    const pending = pendingRaw ? (JSON.parse(pendingRaw) as { email: string; fullName: string }) : null
    localStorage.removeItem(PENDING_KEY)
    localStorage.setItem(SESSION_KEY, email)
    mockStore.setUser(buyerUser(email, pending?.fullName ?? null))
  },

  async signOut() {
    localStorage.removeItem(SESSION_KEY)
    mockStore.setUser(null)
  },
}
