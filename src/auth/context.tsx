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
import { isMock } from '@/config'

import { cognitoAuthProvider } from './cognito'
import { mockAuthProvider } from './mock'
import type { SignUpResult } from './provider'

const provider = isMock ? mockAuthProvider : cognitoAuthProvider

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn'

interface AuthContextValue {
  status: AuthStatus
  email: string | null
  getAccessToken: () => Promise<string | undefined>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<SignUpResult>
  confirmSignUp: (email: string, code: string) => Promise<void>
  resendConfirmationCode: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring')
  const [email, setEmail] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    setAccessTokenProvider(() => provider.getAccessToken())
    let cancelled = false
    provider
      .restoreSession()
      .then((restoredEmail) => {
        if (cancelled) return
        setEmail(restoredEmail)
        setStatus(restoredEmail ? 'signedIn' : 'signedOut')
      })
      .catch(() => {
        if (!cancelled) setStatus('signedOut')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(
    async (signInEmail: string, password: string) => {
      await provider.signIn(signInEmail, password)
      setEmail(signInEmail)
      setStatus('signedIn')
      // Fresh identity — drop any per-user cached data from a previous session
      await queryClient.invalidateQueries()
      // First-login user sync: GET /me creates the user row server-side on first
      // login (see implementation.md §1). Prefetch it so it runs even when the
      // user goes straight to checkout with no /me observer mounted. Fire-and-
      // forget: a /me failure must never block or fail the sign-in itself.
      void queryClient
        .prefetchQuery({ queryKey: queryKeys.me, queryFn: () => api.getMe() })
        .catch(() => {})
    },
    [queryClient],
  )

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
    setEmail(null)
    setStatus('signedOut')
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(
    () => ({
      status,
      email,
      getAccessToken: () => provider.getAccessToken(),
      signIn,
      signUp,
      confirmSignUp,
      resendConfirmationCode,
      signOut,
    }),
    [status, email, signIn, signUp, confirmSignUp, resendConfirmationCode, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
