/// <reference types="vitest/config" />
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiProxyTarget = env.VITE_API_BASE_URL?.replace(/\/$/, '')

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
