import { beforeEach, describe, expect, it, vi } from 'vitest'

type Scenario = 'totp' | 'setup' | 'newpassword'

interface AuthenticationCallbacks {
  onSuccess: (session: unknown) => void
  onFailure: (error: unknown) => void
  totpRequired?: (name: string, parameters: unknown) => void
  mfaSetup?: (name: string, parameters: unknown) => void
  newPasswordRequired?: (userAttributes: unknown, requiredAttributes: unknown) => void
}

function session(groups: string[]) {
  return {
    getAccessToken: () => ({ decodePayload: () => ({ 'cognito:groups': groups }) }),
  }
}

interface ResultCallbacks {
  onSuccess: (session: unknown) => void
  onFailure: (error: unknown) => void
}

const sdk = vi.hoisted(() => ({
  scenario: 'totp' as Scenario,
  signOuts: 0,
  associated: 0,
  verifiedCodes: [] as string[],
  sentCodes: [] as Array<{ code: string; type: string | undefined }>,
  preferences: [] as Array<{ enabled: boolean; preferred: boolean }>,
  // The groups the account carries once its new password is set (drives the post-password routing).
  afterNewPasswordGroups: ['restaurant_manager'] as string[],
  completedPasswords: [] as Array<{ password: string; attributes: unknown }>,
}))

vi.mock('@/config', () => ({
  config: { cognito: { userPoolId: 'eu-west-1_test', clientId: 'client-test' } },
}))

vi.mock('amazon-cognito-identity-js', () => {
  class AuthenticationDetails {}
  class CognitoUserAttribute {}
  class CognitoUserPool {
    getCurrentUser() {
      return null
    }
  }
  class CognitoUser {
    signOut() {
      sdk.signOuts += 1
    }
    authenticateUser(_details: unknown, callbacks: AuthenticationCallbacks) {
      if (sdk.scenario === 'totp') callbacks.totpRequired?.('SOFTWARE_TOKEN_MFA', {})
      else if (sdk.scenario === 'newpassword') callbacks.newPasswordRequired?.({}, {})
      else callbacks.mfaSetup?.('MFA_SETUP', {})
    }
    completeNewPasswordChallenge(
      password: string,
      attributes: unknown,
      callbacks: AuthenticationCallbacks,
    ) {
      sdk.completedPasswords.push({ password, attributes })
      // After the password is set, Cognito re-runs auth. A privileged account with no software token
      // reaches onSuccess (→ enrollment); a kitchen account reaches onSuccess with only staff groups.
      callbacks.onSuccess(session(sdk.afterNewPasswordGroups))
    }
    getUserData(callback: (error: unknown, data: { UserMFASettingList: string[] }) => void) {
      callback(null, { UserMFASettingList: [] })
    }
    associateSoftwareToken(callbacks: {
      associateSecretCode: (secret: string) => void
      onFailure: (error: unknown) => void
    }) {
      sdk.associated += 1
      callbacks.associateSecretCode('LOCAL-SECRET')
    }
    sendMFACode(
      code: string,
      callbacks: ResultCallbacks,
      type?: string,
    ) {
      sdk.sentCodes.push({ code, type })
      callbacks.onSuccess({})
    }
    verifySoftwareToken(code: string, _name: string, callbacks: ResultCallbacks) {
      sdk.verifiedCodes.push(code)
      callbacks.onSuccess({})
    }
    setUserMfaPreference(
      _sms: unknown,
      software: { Enabled: boolean; PreferredMfa: boolean },
      callback: (error?: Error, result?: string) => void,
    ) {
      sdk.preferences.push({ enabled: software.Enabled, preferred: software.PreferredMfa })
      callback(undefined, 'SUCCESS')
    }
  }
  return { AuthenticationDetails, CognitoUser, CognitoUserAttribute, CognitoUserPool }
})

import { cognitoAuthProvider } from './cognito'

beforeEach(async () => {
  sdk.scenario = 'totp'
  sdk.signOuts = 0
  sdk.associated = 0
  sdk.verifiedCodes = []
  sdk.sentCodes = []
  sdk.preferences = []
  sdk.afterNewPasswordGroups = ['restaurant_manager']
  sdk.completedPasswords = []
  await cognitoAuthProvider.cancelStaffSignIn()
  sdk.signOuts = 0
})

describe('Cognito staff MFA callbacks', () => {
  it('never exposes a TOTP challenge through buyer sign-in', async () => {
    await expect(
      cognitoAuthProvider.signIn('admin@example.ie', 'password'),
    ).rejects.toMatchObject({ code: 'staff_sign_in_required' })
    expect(sdk.signOuts).toBe(1)
  })

  it('completes a SOFTWARE_TOKEN_MFA challenge with the TOTP channel', async () => {
    await expect(
      cognitoAuthProvider.beginStaffSignIn('admin@example.ie', 'password'),
    ).resolves.toEqual({ kind: 'totpChallenge' })
    await cognitoAuthProvider.confirmStaffMfa('123456')
    expect(sdk.sentCodes).toEqual([{ code: '123456', type: 'SOFTWARE_TOKEN_MFA' }])
  })

  it('associates, verifies, and prefers a software token during MFA setup', async () => {
    sdk.scenario = 'setup'
    await expect(
      cognitoAuthProvider.beginStaffSignIn('manager@example.ie', 'password'),
    ).resolves.toEqual({ kind: 'totpEnrollment', secret: 'LOCAL-SECRET' })
    expect(sdk.associated).toBe(1)

    await cognitoAuthProvider.confirmStaffMfa('654321')
    expect(sdk.verifiedCodes).toEqual(['654321'])
    expect(sdk.preferences).toEqual([{ enabled: true, preferred: true }])
  })

  it('raises the set-password step for a temp-password account', async () => {
    sdk.scenario = 'newpassword'
    await expect(
      cognitoAuthProvider.beginStaffSignIn('new@example.ie', 'TempPassw0rd!'),
    ).resolves.toEqual({ kind: 'newPasswordRequired' })
  })

  it('sets the new password (stripping attributes) and enrolls TOTP for a manager', async () => {
    sdk.scenario = 'newpassword'
    sdk.afterNewPasswordGroups = ['restaurant_manager']
    await cognitoAuthProvider.beginStaffSignIn('mgr@example.ie', 'TempPassw0rd!')

    await expect(
      cognitoAuthProvider.completeStaffNewPassword('BrandNewPassw0rd!'),
    ).resolves.toEqual({ kind: 'totpEnrollment', secret: 'LOCAL-SECRET' })
    // The password is set with an EMPTY attribute map — passing email_verified etc. would be rejected.
    expect(sdk.completedPasswords).toEqual([{ password: 'BrandNewPassw0rd!', attributes: {} }])
    expect(sdk.associated).toBe(1)
  })

  it('sets the new password and marks a kitchen account ready (no panel session)', async () => {
    sdk.scenario = 'newpassword'
    sdk.afterNewPasswordGroups = ['restaurant_staff']
    await cognitoAuthProvider.beginStaffSignIn('kitchen@example.ie', 'TempPassw0rd!')

    await expect(
      cognitoAuthProvider.completeStaffNewPassword('BrandNewPassw0rd!'),
    ).resolves.toEqual({ kind: 'staffReady' })
    expect(sdk.signOuts).toBeGreaterThan(0)
  })
})
