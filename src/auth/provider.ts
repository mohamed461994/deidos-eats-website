/** Auth abstraction: mock (default) or real Cognito SRP — same interface. */
export interface SignUpResult {
  needsConfirmation: boolean
}

export interface AuthProvider {
  /** Resolve a valid access token, refreshing if the SDK supports it. */
  getAccessToken(): Promise<string | undefined>
  /** Returns the signed-in email if a session could be restored. */
  restoreSession(): Promise<string | null>
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, fullName: string): Promise<SignUpResult>
  confirmSignUp(email: string, code: string): Promise<void>
  signOut(): Promise<void>
}

export type AuthFlowErrorCode =
  | 'invalid_credentials'
  | 'user_exists'
  | 'code_mismatch'
  | 'password_policy'
  | 'not_confirmed'
  | 'unknown'

export class AuthFlowError extends Error {
  readonly code: AuthFlowErrorCode

  constructor(message: string, code: AuthFlowErrorCode = 'unknown') {
    super(message)
    this.name = 'AuthFlowError'
    this.code = code
  }
}
