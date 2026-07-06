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

import { setAccessTokenProvider } from '@/api/http'
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
    },
    [queryClient],
  )

  const signUp = useCallback(
    (signUpEmail: string, password: string, fullName: string) =>
      provider.signUp(signUpEmail, password, fullName),
    [],
  )

  const confirmSignUp = useCallback(
    async (confirmEmail: string, code: string) => {
      await provider.confirmSignUp(confirmEmail, code)
      setEmail(confirmEmail)
      setStatus('signedIn')
      await queryClient.invalidateQueries()
    },
    [queryClient],
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
      signOut,
    }),
    [status, email, signIn, signUp, confirmSignUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
