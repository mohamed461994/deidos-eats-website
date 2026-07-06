/// <reference types="vitest/config" />
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiProxyTarget = env.VITE_API_BASE_URL?.replace(/\/$/, '')

  // Production build guard — the primary defense against the bug where the site
  // shipped in-browser fake data instead of the real API (see implementation.md
  // §0/§7). `vite build` runs in 'production' mode; the dev server ('development')
  // and vitest ('test') never reach this. An UNSET VITE_API_MODE trips neither
  // check, so a local build-verify (`npm run build` with no .env.production) still
  // passes — only an explicit misconfiguration fails the build.
  if (mode === 'production') {
    if (env.VITE_API_MODE === 'mock') {
      throw new Error(
        'Refusing to build: VITE_API_MODE=mock in a production build. Mock mode serves ' +
          'in-browser fake data and must never be deployed. Set VITE_API_MODE=live.',
      )
    }
    if (env.VITE_API_MODE === 'live' && !env.VITE_API_BASE_URL) {
      throw new Error(
        'Production build in live mode requires VITE_API_BASE_URL (the deployed API origin). ' +
          'Inject it in the CI build environment / .env.production (see implementation.md §7).',
      )
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      global: 'globalThis',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@deidos-eats/contracts': path.resolve(__dirname, '../deidos-eats-contracts'),
      },
    },
    server: apiProxyTarget
      ? {
          proxy: {
            '/api': {
              changeOrigin: true,
              rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
              secure: true,
              target: apiProxyTarget,
            },
          },
        }
      : undefined,
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }
})
