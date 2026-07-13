/**
 * The app-wide TanStack Query client. Lives in its own module (not App.tsx) so
 * the test harness can clear the cache between tests — the client is created
 * once per module graph, which vitest isolates per FILE, not per test.
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
