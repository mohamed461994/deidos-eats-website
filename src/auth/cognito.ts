/**
 * Real Cognito auth via SRP (amazon-cognito-identity-js) — the same direct
 * user-pool flow the dashboard and iOS app use (no hosted UI; OAuth is
 * disabled on the pool's app clients).
 *
 * The website has its own app client on the shared buyer pool
 * (VITE_COGNITO_CLIENT_ID in .env.development), and the dev API verifier
 * accepts it (COGNITO_WEBSITE_CLIENT_ID). Same pool as iOS → same `sub` →
 * the same `users` row and profile data everywhere.
 */
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
  type IAuthenticationCallback,
} from 'amazon-cognito-identity-js'

import { config } from '@/config'

import {
  AuthFlowError,
  type AuthProvider,
  type SignUpResult,
  type StaffSignInStep,
} from './provider'

type PendingStaffMode = 'challenge' | 'enrollment' | 'newPassword'

let pendingStaffUser: CognitoUser | null = null
let pendingStaffMode: PendingStaffMode | null = null

function clearPendingStaff() {
  pendingStaffUser = null
  pendingStaffMode = null
}

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
    case 'EnableSoftwareTokenMFAException':
      return new AuthFlowError('That authenticator code is wrong or expired.', 'mfa_code_mismatch')
    case 'InvalidPasswordException':
      return new AuthFlowError(
        'Password must be at least 12 characters with upper, lower, number and symbol.',
        'password_policy',
      )
    case 'UserNotConfirmedException':
      return new AuthFlowError('Confirm your email first — check your inbox.', 'not_confirmed')
    case 'LimitExceededException':
    case 'TooManyRequestsException':
      return new AuthFlowError(
        'Too many attempts — wait a moment and try again.',
        'rate_limited',
      )
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

function sessionGroups(session: CognitoUserSession): string[] {
  const payload = session.getAccessToken().decodePayload() as { 'cognito:groups'?: unknown }
  return Array.isArray(payload['cognito:groups']) ? (payload['cognito:groups'] as string[]) : []
}

function setSoftwareTokenPreferred(user: CognitoUser): Promise<void> {
  return new Promise((resolve, reject) => {
    user.setUserMfaPreference(
      null,
      { Enabled: true, PreferredMfa: true },
      (error) => (error ? reject(mapCognitoError(error)) : resolve()),
    )
  })
}

function beginSoftwareTokenEnrollment(user: CognitoUser): Promise<StaffSignInStep> {
  pendingStaffUser = user
  pendingStaffMode = 'enrollment'
  return new Promise((resolve, reject) => {
    user.associateSoftwareToken({
      associateSecretCode: (secret) => resolve({ kind: 'totpEnrollment', secret }),
      onFailure: (error) => {
        clearPendingStaff()
        reject(mapCognitoError(error))
      },
    })
  })
}

/**
 * The staff auth callbacks, shared by `beginStaffSignIn` (authenticateUser) and
 * `completeStaffNewPassword` (completeNewPasswordChallenge) so both go through the SAME
 * post-authentication routing. On a completed authentication:
 * - admin / manager → enroll TOTP (or, if a verified token exists but isn't preferred, prefer it and
 *   require one more sign-in so Cognito challenges next time) → the panel;
 * - kitchen staff (restaurant_staff) → `staffReady` (they belong on the dashboard/Orderpad);
 * - anything else → denied.
 * The `newPasswordRequired` branch converts a temp-password account into the set-password step.
 */
function staffAuthCallbacks(
  user: CognitoUser,
  resolve: (step: StaffSignInStep) => void,
  reject: (error: unknown) => void,
): IAuthenticationCallback {
  return {
    onSuccess: (session) => {
      const groups = sessionGroups(session)
      const privileged = groups.includes('admin') || groups.includes('restaurant_manager')
      if (!privileged) {
        // A signed-out terminal: kitchen staff activate here but never hold a panel session.
        user.signOut()
        clearPendingStaff()
        if (groups.includes('restaurant_staff')) {
          resolve({ kind: 'staffReady' })
        } else {
          reject(
            new AuthFlowError(
              'This account does not have access to the staff panel.',
              'staff_access_denied',
            ),
          )
        }
        return
      }

      user.getUserData((error, data) => {
        if (error) {
          user.signOut()
          reject(mapCognitoError(error))
          return
        }

        if (data?.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA')) {
          // In OPTIONAL-MFA pools a verified token that is not preferred can let auth complete
          // without a challenge. Prefer it, discard this non-MFA session, and require a fresh
          // sign-in so Cognito must challenge the next attempt.
          void setSoftwareTokenPreferred(user)
            .then(() => {
              user.signOut()
              reject(
                new AuthFlowError(
                  'Authenticator verification is now required. Sign in once more to continue.',
                  'mfa_retry_required',
                ),
              )
            })
            .catch((preferenceError) => {
              user.signOut()
              reject(preferenceError)
            })
          return
        }

        void beginSoftwareTokenEnrollment(user).then(resolve, reject)
      })
    },
    onFailure: (error) => {
      clearPendingStaff()
      reject(mapCognitoError(error))
    },
    totpRequired: () => {
      pendingStaffUser = user
      pendingStaffMode = 'challenge'
      resolve({ kind: 'totpChallenge' })
    },
    mfaSetup: () => {
      void beginSoftwareTokenEnrollment(user).then(resolve, reject)
    },
    mfaRequired: () => {
      user.signOut()
      clearPendingStaff()
      reject(
        new AuthFlowError('This staff panel supports authenticator-app MFA only.', 'unsupported_challenge'),
      )
    },
    selectMFAType: () => {
      user.signOut()
      clearPendingStaff()
      reject(
        new AuthFlowError('This staff panel supports authenticator-app MFA only.', 'unsupported_challenge'),
      )
    },
    newPasswordRequired: () => {
      // Fires before any session exists (temp-password first login). Hold the challenge and let the
      // UI collect a new password; completing it re-enters these callbacks via onSuccess/totpRequired.
      pendingStaffUser = user
      pendingStaffMode = 'newPassword'
      resolve({ kind: 'newPasswordRequired' })
    },
  }
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
    // A buyer sign-in must never leave a partial privileged challenge available
    // in module state after the user navigates away from the staff entry.
    pendingStaffUser?.signOut()
    clearPendingStaff()
    const user = new CognitoUser({ Username: email, Pool: pool() })
    const details = new AuthenticationDetails({ Username: email, Password: password })
    return new Promise((resolve, reject) => {
      const rejectStaffChallenge = () => {
        user.signOut()
        reject(
          new AuthFlowError(
            'This account uses the designated staff sign-in page.',
            'staff_sign_in_required',
          ),
        )
      }
      user.authenticateUser(details, {
        onSuccess: () => resolve(),
        onFailure: (error) => reject(mapCognitoError(error)),
        mfaRequired: rejectStaffChallenge,
        mfaSetup: rejectStaffChallenge,
        selectMFAType: rejectStaffChallenge,
        totpRequired: rejectStaffChallenge,
        newPasswordRequired: rejectStaffChallenge,
      })
    })
  },

  beginStaffSignIn(email, password) {
    pendingStaffUser?.signOut()
    clearPendingStaff()
    pool().getCurrentUser()?.signOut()

    const user = new CognitoUser({ Username: email, Pool: pool() })
    const details = new AuthenticationDetails({ Username: email, Password: password })
    return new Promise<StaffSignInStep>((resolve, reject) => {
      user.authenticateUser(details, staffAuthCallbacks(user, resolve, reject))
    })
  },

  completeStaffNewPassword(newPassword) {
    const user = pendingStaffUser
    if (!user || pendingStaffMode !== 'newPassword') {
      return Promise.reject(new AuthFlowError('Start staff sign-in again.', 'unknown'))
    }
    return new Promise<StaffSignInStep>((resolve, reject) => {
      // Pass an empty attribute map: amazon-cognito-identity-js rejects the challenge if any
      // non-writable attribute (email_verified, etc.) is included. Completing re-enters the shared
      // callbacks (onSuccess → enrollment / staffReady, or totpRequired → challenge).
      user.completeNewPasswordChallenge(newPassword, {}, staffAuthCallbacks(user, resolve, reject))
    })
  },

  confirmStaffMfa(code) {
    const user = pendingStaffUser
    const mode = pendingStaffMode
    if (!user || !mode) {
      return Promise.reject(new AuthFlowError('Start staff sign-in again.', 'unknown'))
    }

    return new Promise((resolve, reject) => {
      const onFailure = (error: unknown) => reject(mapCognitoError(error))
      const onSuccess = () => {
        if (mode === 'challenge') {
          clearPendingStaff()
          resolve()
          return
        }
        void setSoftwareTokenPreferred(user)
          .then(() => {
            clearPendingStaff()
            resolve()
          })
          .catch((error) => {
            user.signOut()
            clearPendingStaff()
            reject(error)
          })
      }

      if (mode === 'challenge') {
        user.sendMFACode(code, { onSuccess, onFailure }, 'SOFTWARE_TOKEN_MFA')
      } else {
        user.verifySoftwareToken(code, 'Deidos Eats staff panel', { onSuccess, onFailure })
      }
    })
  },

  async cancelStaffSignIn() {
    pendingStaffUser?.signOut()
    clearPendingStaff()
    pool().getCurrentUser()?.signOut()
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
        // confirmRegistration does NOT establish a session — the caller signs in next.
        resolve()
      })
    })
  },

  resendConfirmationCode(email) {
    const user = new CognitoUser({ Username: email, Pool: pool() })
    return new Promise((resolve, reject) => {
      user.resendConfirmationCode((error) => {
        if (error) return reject(mapCognitoError(error))
        resolve()
      })
    })
  },

  async signOut() {
    pendingStaffUser?.signOut()
    clearPendingStaff()
    pool().getCurrentUser()?.signOut()
  },
}
