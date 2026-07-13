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
} from 'amazon-cognito-identity-js'

import { config } from '@/config'

import {
  AuthFlowError,
  type AuthProvider,
  type SignUpResult,
  type StaffSignInStep,
} from './provider'

type PendingStaffMode = 'challenge' | 'enrollment'

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

function isPrivilegedSession(session: CognitoUserSession): boolean {
  const payload = session.getAccessToken().decodePayload() as {
    'cognito:groups'?: unknown
  }
  const groups = Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] : []
  return groups.includes('admin') || groups.includes('restaurant_manager')
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
      user.authenticateUser(details, {
        onSuccess: (session) => {
          if (!isPrivilegedSession(session)) {
            user.signOut()
            reject(
              new AuthFlowError(
                'This account does not have access to the staff panel.',
                'staff_access_denied',
              ),
            )
            return
          }

          user.getUserData((error, data) => {
            if (error) {
              user.signOut()
              reject(mapCognitoError(error))
              return
            }

            if (data?.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA')) {
              // In OPTIONAL-MFA pools a verified token that is not preferred can let auth
              // complete without a challenge. Prefer it, discard this non-MFA session, and
              // require a fresh sign-in so Cognito must challenge the next attempt.
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
            new AuthFlowError(
              'This staff panel supports authenticator-app MFA only.',
              'unsupported_challenge',
            ),
          )
        },
        selectMFAType: () => {
          user.signOut()
          clearPendingStaff()
          reject(
            new AuthFlowError(
              'This staff panel supports authenticator-app MFA only.',
              'unsupported_challenge',
            ),
          )
        },
        newPasswordRequired: () => {
          user.signOut()
          clearPendingStaff()
          reject(
            new AuthFlowError(
              'This account needs administrator attention before it can sign in.',
              'unsupported_challenge',
            ),
          )
        },
      })
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
