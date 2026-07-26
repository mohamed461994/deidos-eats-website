/**
 * The dev-only staff-TOTP escape hatch resolves in `config.ts`, and every auth test mocks
 * `@/config` away — so this is the only place the real expression is evaluated. Like
 * `pin-redirect.test.tsx`, the module reads the env at import time, so each case stubs the
 * env and re-imports the module graph.
 *
 * Vitest runs with `import.meta.env.DEV === true`, which is exactly the local `npm run dev`
 * condition the flag is meant to serve.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

async function loadFlag() {
  const { config } = await import('@/config')
  return config.devDisableStaffTotp
}

describe('config.devDisableStaffTotp', () => {
  it('is off when the flag is unset', async () => {
    await expect(loadFlag()).resolves.toBe(false)
  })

  it('is on for the local dev server (DEV) when the flag is set', async () => {
    vi.stubEnv('VITE_DEV_DISABLE_STAFF_TOTP', 'true')
    expect(import.meta.env.DEV).toBe(true)
    await expect(loadFlag()).resolves.toBe(true)
  })

  it('is on for a bundle explicitly marked as the dev deployment', async () => {
    vi.stubEnv('VITE_DEV_DISABLE_STAFF_TOTP', 'true')
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEPLOY_ENV', 'dev')
    await expect(loadFlag()).resolves.toBe(true)
  })

  // The fail-closed cases: a non-dev bundle must ignore the flag even when it is set, so a
  // stray VITE_DEV_DISABLE_STAFF_TOTP can never open the prod staff panel on a password alone.
  it('is off in a bundle marked prod, even with the flag set', async () => {
    vi.stubEnv('VITE_DEV_DISABLE_STAFF_TOTP', 'true')
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEPLOY_ENV', 'prod')
    await expect(loadFlag()).resolves.toBe(false)
  })

  it('is off in an UNMARKED non-dev bundle, even with the flag set', async () => {
    vi.stubEnv('VITE_DEV_DISABLE_STAFF_TOTP', 'true')
    vi.stubEnv('DEV', false)
    await expect(loadFlag()).resolves.toBe(false)
  })

  it('only accepts the exact string "true"', async () => {
    vi.stubEnv('VITE_DEV_DISABLE_STAFF_TOTP', '1')
    await expect(loadFlag()).resolves.toBe(false)
  })
})
