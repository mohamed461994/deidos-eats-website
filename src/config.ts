/**
 * Runtime configuration. `mock` mode (the default) runs the whole site against
 * the in-browser mock API — no network, no AWS. `live` mode targets the real
 * Deidos Eats API through the Vite /api proxy in dev (the API has no browser
 * CORS support yet — see implementation.md).
 */
export type ApiMode = 'mock' | 'live'

const env = import.meta.env

export const config = {
  apiMode: (env.VITE_API_MODE === 'live' ? 'live' : 'mock') as ApiMode,
  /** In dev the Vite proxy rewrites /api/* onto VITE_API_BASE_URL (same-origin, avoids CORS). */
  apiBaseUrl: env.DEV ? '/api' : ((env.VITE_API_BASE_URL as string | undefined) ?? ''),
  wsUrl: (env.VITE_WS_URL as string | undefined) ?? '',
  cognito: {
    userPoolId: (env.VITE_COGNITO_USER_POOL_ID as string | undefined) ?? '',
    clientId: (env.VITE_COGNITO_CLIENT_ID as string | undefined) ?? '',
  },
  stripePublishableKey: (env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) ?? '',
  restaurantId: (env.VITE_RESTAURANT_ID as string | undefined) ?? '',
} as const

export const isMock = config.apiMode === 'mock'
