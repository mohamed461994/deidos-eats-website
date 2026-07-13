import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { api } from '@/api'
import { setAccessTokenProvider } from '@/api/http'
import { queryKeys } from '@/api/queries'
import type { User } from '@/api/types'
import { isMock } from '@/config'

import { cognitoAuthProvider } from './cognito'
import { mockAuthProvider } from './mock'
import {
  AuthFlowError,
  type SignUpResult,
  type StaffSignInStep,
} from './provider'

const provider = isMock ? mockAuthProvider : cognitoAuthProvider
const STAFF_VERIFIED_SESSION_KEY = 'deidos-staff-mfa-verified-v1'

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn'

function isPrivilegedRole(
  role: User['role'],
): role is Extract<User['role'], 'admin' | 'restaurant_manager'> {
  return role === 'admin' || role === 'restaurant_manager'
}

function isStaffRole(role: User['role']): boolean {
  return role !== 'buyer'
}

interface AuthContextValue {
  status: AuthStatus
  email: string | null
  role: User['role'] | null
  staffMfaStep: StaffSignInStep | null
  staffEmail: string | null
  staffVerified: boolean
  getAccessToken: () => Promise<string | undefined>
  signIn: (email: string, password: string) => Promise<void>
  beginStaffSignIn: (email: string, password: string) => Promise<StaffSignInStep>
  confirmStaffMfa: (code: string) => Promise<void>
  cancelStaffSignIn: () => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<SignUpResult>
  confirmSignUp: (email: string, code: string) => Promise<void>
  resendConfirmationCode: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring')
  const [email, setEmail] = useState<string | null>(null)
  const [role, setRole] = useState<User['role'] | null>(null)
  const [staffMfaStep, setStaffMfaStep] = useState<StaffSignInStep | null>(null)
  const [staffEmail, setStaffEmail] = useState<string | null>(null)
  const [staffVerified, setStaffVerified] = useState(false)
  const queryClient = useQueryClient()

  const resetIdentityState = useCallback(() => {
    sessionStorage.removeItem(STAFF_VERIFIED_SESSION_KEY)
    setEmail(null)
    setRole(null)
    setStaffMfaStep(null)
    setStaffEmail(null)
    setStaffVerified(false)
    setStatus('signedOut')
  }, [])

  const clearLocalIdentity = useCallback(() => {
    resetIdentityState()
    queryClient.clear()
  }, [queryClient, resetIdentityState])

  const setLocalIdentity = useCallback(
    (user: User, verifiedStaff: boolean, clearQueries: boolean) => {
      if (clearQueries) queryClient.clear()
      queryClient.setQueryData(queryKeys.me, user)
      setEmail(user.email)
      setRole(user.role)
      setStaffMfaStep(null)
      setStaffEmail(null)
      setStaffVerified(verifiedStaff)
      setStatus('signedIn')
    },
    [queryClient],
  )

  useEffect(() => {
    setAccessTokenProvider(() => provider.getAccessToken())
    let cancelled = false
    provider
      .restoreSession()
      .then(async (restoredEmail) => {
        if (!restoredEmail) return null
        const user = await api.getMe()
        const privileged = isPrivilegedRole(user.role)
        const verifiedStaff = sessionStorage.getItem(STAFF_VERIFIED_SESSION_KEY) === '1'
        if (isStaffRole(user.role) && (!privileged || !verifiedStaff)) {
          await provider.signOut()
          return null
        }
        return { user, verifiedStaff: privileged && verifiedStaff }
      })
      .then((restored) => {
        if (cancelled) return
        if (!restored) {
          // This is initial restoration, not an identity transition. Clearing the
          // whole query client here would cancel buyer-page reads started by children.
          resetIdentityState()
          return
        }
        setLocalIdentity(restored.user, restored.verifiedStaff, false)
      })
      .catch(async () => {
        await provider.signOut().catch(() => {})
        if (!cancelled) resetIdentityState()
      })
    return () => {
      cancelled = true
    }
  }, [resetIdentityState, setLocalIdentity])

  const signIn = useCallback(
    async (signInEmail: string, password: string) => {
      sessionStorage.removeItem(STAFF_VERIFIED_SESSION_KEY)
      await provider.signIn(signInEmail, password)
      try {
        // Fail closed: the buyer flow must prove this is a buyer before retaining the
        // Cognito session. A privileged account is immediately signed out, even when
        // OPTIONAL MFA allowed an unenrolled account to authenticate without a challenge.
        const user = await api.getMe()
        if (isStaffRole(user.role)) {
          await provider.signOut()
          clearLocalIdentity()
          throw new AuthFlowError(
            'Use your designated staff sign-in page for this account.',
            'staff_sign_in_required',
          )
        }
        setLocalIdentity(user, false, true)
      } catch (error) {
        if (error instanceof AuthFlowError && error.code === 'staff_sign_in_required') throw error
        await provider.signOut().catch(() => {})
        clearLocalIdentity()
        throw new AuthFlowError('Sign-in could not be completed. Try again.', 'unknown')
      }
    },
    [clearLocalIdentity, setLocalIdentity],
  )

  const finishStaffSession = useCallback(async () => {
    try {
      const user = await api.getMe()
      if (!isPrivilegedRole(user.role)) {
        throw new AuthFlowError(
          'This account does not have access to the staff panel.',
          'staff_access_denied',
        )
      }
      sessionStorage.setItem(STAFF_VERIFIED_SESSION_KEY, '1')
      setLocalIdentity(user, true, true)
    } catch (error) {
      await provider.signOut().catch(() => {})
      clearLocalIdentity()
      if (error instanceof AuthFlowError) throw error
      throw new AuthFlowError('Staff sign-in could not be completed. Try again.', 'unknown')
    }
  }, [clearLocalIdentity, setLocalIdentity])

  const beginStaffSignIn = useCallback(
    async (signInEmail: string, password: string) => {
      clearLocalIdentity()
      const normalizedEmail = signInEmail.trim()
      const step = await provider.beginStaffSignIn(normalizedEmail, password)
      setStaffEmail(normalizedEmail)
      setStaffMfaStep(step)
      setStaffVerified(false)
      return step
    },
    [clearLocalIdentity],
  )

  const confirmStaffMfa = useCallback(
    async (code: string) => {
      await provider.confirmStaffMfa(code)
      await finishStaffSession()
    },
    [finishStaffSession],
  )

  const cancelStaffSignIn = useCallback(async () => {
    await provider.cancelStaffSignIn()
    clearLocalIdentity()
  }, [clearLocalIdentity])

  const signUp = useCallback(
    (signUpEmail: string, password: string, fullName: string) =>
      provider.signUp(signUpEmail, password, fullName),
    [],
  )

  const confirmSignUp = useCallback(
    // Confirming an account does NOT establish a session (real Cognito behaviour):
    // no status/email change here. The caller signs in afterwards to get a session.
    (confirmEmail: string, code: string) => provider.confirmSignUp(confirmEmail, code),
    [],
  )

  const resendConfirmationCode = useCallback(
    (resendEmail: string) => provider.resendConfirmationCode(resendEmail),
    [],
  )

  const signOut = useCallback(async () => {
    await provider.signOut()
    clearLocalIdentity()
  }, [clearLocalIdentity])

  const value = useMemo(
    () => ({
      status,
      email,
      role,
      staffMfaStep,
      staffEmail,
      staffVerified,
      getAccessToken: () => provider.getAccessToken(),
      signIn,
      beginStaffSignIn,
      confirmStaffMfa,
      cancelStaffSignIn,
      signUp,
      confirmSignUp,
      resendConfirmationCode,
      signOut,
    }),
    [
      status,
      email,
      role,
      staffMfaStep,
      staffEmail,
      staffVerified,
      signIn,
      beginStaffSignIn,
      confirmStaffMfa,
      cancelStaffSignIn,
      signUp,
      confirmSignUp,
      resendConfirmationCode,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
