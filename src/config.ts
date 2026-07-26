/**
 * Runtime configuration. `live` (the default) targets the real Deidos Eats
 * API — the same backend and user data as the iOS app — through the Vite
 * /api proxy in dev (the API has no browser CORS support yet — see
 * implementation.md). `mock` exists ONLY for the unit-test harness (set via
 * .env.test); it must never be used to run the site — see implementation.md §0.
 */
import { normalizeStaffSignInPath } from '@/lib/staff-path'

export type ApiMode = 'mock' | 'live'

const env = import.meta.env

export const config = {
  apiMode: (env.VITE_API_MODE === 'mock' ? 'mock' : 'live') as ApiMode,
  /** In dev the Vite proxy rewrites /api/* onto VITE_API_BASE_URL (same-origin, avoids CORS). */
  apiBaseUrl: env.DEV ? '/api' : ((env.VITE_API_BASE_URL as string | undefined) ?? ''),
  wsUrl: (env.VITE_WS_URL as string | undefined) ?? '',
  cognito: {
    userPoolId: (env.VITE_COGNITO_USER_POOL_ID as string | undefined) ?? '',
    clientId: (env.VITE_COGNITO_CLIENT_ID as string | undefined) ?? '',
  },
  /** Public noise-reduction route only; MFA + server authz remain the security boundary. */
  staffSignInPath: normalizeStaffSignInPath(env.VITE_STAFF_SIGN_IN_PATH),
  stripePublishableKey: (env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) ?? '',
  restaurantId: (env.VITE_RESTAURANT_ID as string | undefined) ?? '',
  /**
   * Dev-only escape hatch: open the staff/admin panel on a password alone, skipping the
   * TOTP enrollment/challenge gate. Fails CLOSED, and deliberately does NOT key off
   * `import.meta.env.PROD` the way the mock guard does — the deployed dev site is itself a
   * production-mode `vite build`. It is honoured only on the Vite dev server or in a bundle
   * explicitly stamped VITE_DEPLOY_ENV=dev by deploy-website.yml, so a production bundle
   * ignores the flag even if someone sets it.
   */
  devDisableStaffTotp:
    env.VITE_DEV_DISABLE_STAFF_TOTP === 'true' &&
    (env.DEV === true || env.VITE_DEPLOY_ENV === 'dev'),
} as const

export const isMock = config.apiMode === 'mock'

// Runtime backstop for the exact bug that started this: a production bundle must
// never serve mock (in-browser fake) data. The vite build guard (vite.config.ts)
// should already stop a mock bundle being produced in CI; this refuses at load
// time if one reaches production anyway — a white screen + console error beats
// silently showing users fake profiles/orders. Never fires in dev or the vitest
// harness, where import.meta.env.PROD is false (the mock tests rely on that).
if (import.meta.env.PROD && isMock) {
  throw new Error(
    'deidos-eats-website: mock mode detected in a production build. Refusing to serve fake ' +
      'data. Rebuild with VITE_API_MODE=live (see implementation.md §0).',
  )
}
