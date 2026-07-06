/**
 * Real Cognito auth via SRP (amazon-cognito-identity-js) — the same direct
 * user-pool flow the dashboard and iOS app use (no hosted UI; OAuth is
 * disabled on the pool's app clients).
 *
 * ⚠️ LIVE-MODE PREREQUISITE: the pool needs a *website* app client, and the
 * API's token verifier must accept its client ID — currently it only accepts
 * the iOS and dashboard clients. See implementation.md → backend gaps.
 */
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js'

import { config } from '@/config'

import { AuthFlowError, type AuthProvider, type SignUpResult } from './provider'

function pool(): CognitoUserPool {
  if (!config.cognito.userPoolId || !config.cognito.clientId) {
    throw new AuthFlowError('Cognito is not configured — set VITE_COGNITO_* env vars.', 'unknown')
  }
  return new CognitoUserPool({
    UserPoolId: config.cognito.userPoolId,
    ClientId: config.cognito.clientId,
  })
}

function mapCognitoError(error: unknown): AuthFlowError {
  const err = error as { code?: string; message?: string }
  switch (err.code) {
    case 'NotAuthorizedException':
      return new AuthFlowError('Wrong email or password.', 'invalid_credentials')
    case 'UsernameExistsException':
      return new AuthFlowError('An account with this email already exists.', 'user_exists')
    case 'CodeMismatchException':
    case 'ExpiredCodeException':
      return new AuthFlowError('That confirmation code is wrong or expired.', 'code_mismatch')
    case 'InvalidPasswordException':
      return new AuthFlowError(
        'Password must be at least 12 characters with upper, lower, number and symbol.',
        'password_policy',
      )
    case 'UserNotConfirmedException':
      return new AuthFlowError('Confirm your email first — check your inbox.', 'not_confirmed')
    default:
      return new AuthFlowError(err.message ?? 'Sign-in failed. Try again.', 'unknown')
  }
}

function currentSession(): Promise<CognitoUserSession | null> {
  const user = pool().getCurrentUser()
  if (!user) return Promise.resolve(null)
  return new Promise((resolve) => {
    user.getSession((error: Error | null, session: CognitoUserSession | null) => {
      resolve(error || !session?.isValid() ? null : session)
    })
  })
}

export const cognitoAuthProvider: AuthProvider = {
  async getAccessToken() {
    const session = await currentSession()
    return session?.getAccessToken().getJwtToken()
  },

  async restoreSession() {
    const session = await currentSession()
    if (!session) return null
    const payload = session.getIdToken().decodePayload() as { email?: string }
    return payload.email ?? pool().getCurrentUser()?.getUsername() ?? null
  },

  signIn(email, password) {
    const user = new CognitoUser({ Username: email, Pool: pool() })
    const details = new AuthenticationDetails({ Username: email, Password: password })
    return new Promise((resolve, reject) => {
      user.authenticateUser(details, {
        onSuccess: () => resolve(),
        onFailure: (error) => reject(mapCognitoError(error)),
      })
    })
  },

  signUp(email, password, fullName): Promise<SignUpResult> {
    const attributes = [new CognitoUserAttribute({ Name: 'name', Value: fullName })]
    return new Promise((resolve, reject) => {
      pool().signUp(email, password, attributes, [], (error, result) => {
        if (error) return reject(mapCognitoError(error))
        resolve({ needsConfirmation: !result?.userConfirmed })
      })
    })
  },

  confirmSignUp(email, code) {
    const user = new CognitoUser({ Username: email, Pool: pool() })
    return new Promise((resolve, reject) => {
      user.confirmRegistration(code, true, (error) => {
        if (error) return reject(mapCognitoError(error))
        resolve()
      })
    })
  },

  async signOut() {
    pool().getCurrentUser()?.signOut()
  },
}
