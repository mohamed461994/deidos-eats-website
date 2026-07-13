/**
 * The VITE_RESTAURANT_ID rollback pin: with a restaurant pinned, the home page
 * behaves as a single-restaurant site and redirects `/` straight into that
 * restaurant's home. The config module reads the env at import time, so the
 * module graph is reloaded with the stubbed env per test.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESTAURANT_A_ID } from '@/api/mock/data'

class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
vi.stubGlobal('IntersectionObserver', IO)
window.scrollTo = () => {}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('VITE_RESTAURANT_ID pin', () => {
  it('redirects the home page into the pinned restaurant', async () => {
    vi.stubEnv('VITE_RESTAURANT_ID', RESTAURANT_A_ID)
    const { default: PinnedApp } = await import('@/App')

    window.history.pushState({}, '', '/')
    render(<PinnedApp />)

    await screen.findByRole('heading', { name: 'Deidos Grill', level: 1 }, { timeout: 5000 })
    expect(window.location.pathname).toBe('/r/deidos-grill')
  }, 20000)

  it('stays on the branch-first home when nothing is pinned', async () => {
    vi.stubEnv('VITE_RESTAURANT_ID', '')
    const { default: FreshApp } = await import('@/App')

    window.history.pushState({}, '', '/')
    render(<FreshApp />)

    await screen.findByRole('heading', { name: /hungry\?/i }, { timeout: 5000 })
    expect(window.location.pathname).toBe('/')
  }, 20000)
})
