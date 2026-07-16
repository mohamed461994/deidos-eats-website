/** Auth abstraction: mock (default) or real Cognito SRP — same interface. */
export interface SignUpResult {
  needsConfirmation: boolean
}

export type StaffSignInStep =
  // A brand-new (admin-created) account must set its own password before anything else.
  | { kind: 'newPasswordRequired' }
  | { kind: 'totpEnrollment'; secret: string }
  | { kind: 'totpChallenge' }
  // Terminal step for kitchen (restaurant_staff) accounts: they activate here but work on the
  // dashboard/Orderpad, not this panel — so there is no further step and no session is kept.
  | { kind: 'staffReady' }

export interface AuthProvider {
  /** Resolve a valid access token, refreshing if the SDK supports it. */
  getAccessToken(): Promise<string | undefined>
  /** Returns the signed-in email if a session could be restored. */
  restoreSession(): Promise<string | null>
  signIn(email: string, password: string): Promise<void>
  /** Start the isolated privileged sign-in flow. Never used by buyer `/signin`. */
  beginStaffSignIn(email: string, password: string): Promise<StaffSignInStep>
  /** Set a new password to clear the NEW_PASSWORD_REQUIRED challenge, returning the next step. */
  completeStaffNewPassword(newPassword: string): Promise<StaffSignInStep>
  /** Complete the pending TOTP enrollment or SOFTWARE_TOKEN_MFA challenge. */
  confirmStaffMfa(code: string): Promise<void>
  /** Abandon any pending privileged challenge and clear its partial session. */
  cancelStaffSignIn(): Promise<void>
  signUp(email: string, password: string, fullName: string): Promise<SignUpResult>
  confirmSignUp(email: string, code: string): Promise<void>
  /** Re-send the email confirmation code for an unconfirmed account. */
  resendConfirmationCode(email: string): Promise<void>
  signOut(): Promise<void>
}

export type AuthFlowErrorCode =
  | 'invalid_credentials'
  | 'user_exists'
  | 'code_mismatch'
  | 'password_policy'
  | 'not_confirmed'
  | 'rate_limited'
  | 'staff_sign_in_required'
  | 'staff_access_denied'
  | 'mfa_code_mismatch'
  | 'mfa_retry_required'
  | 'unsupported_challenge'
  | 'unknown'

export class AuthFlowError extends Error {
  readonly code: AuthFlowErrorCode

  constructor(message: string, code: AuthFlowErrorCode = 'unknown') {
    super(message)
    this.name = 'AuthFlowError'
    this.code = code
  }
}
