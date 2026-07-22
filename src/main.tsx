import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { queryClient } from './api/query-client'
import { setupQueryPersistence } from './api/query-persistence'
import { isMock } from './config'
import './index.css'

// Warm the query cache from the last visit's public browse data (menus,
// restaurants, home aggregate) before first render — live mode only; the
// vitest/mock harness must stay isolated per test and never rehydrate a
// previous run's cache. See src/api/query-persistence.ts for the safety model.
if (!isMock) {
  setupQueryPersistence(queryClient)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
