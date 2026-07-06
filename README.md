# deidos-eats-website

Customer-facing website for the Deidos Eats platform — public brand site **and** web
ordering channel (browse → cart → checkout → live order tracking). Placeholder brand:
**Púca Pizza** (all identity lives in swappable tokens; see `PRODUCT.md` and `DESIGN.md`).

Stack: React 19 + Vite + TypeScript + Tailwind v4 + TanStack Query + react-router, matching
`deidos-eats-restaurant-dashboard` conventions. API shapes come from
`@deidos-eats/contracts` (npm file dependency on the sibling repo).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (or next free port)
```

The site runs in **live mode** against the **real dev API** — the same backend, Cognito
pool, and user data as the iOS app. The dev configuration is committed in
`.env.development` (public identifiers only — API URL, pool/client IDs, Stripe
publishable key; never secrets), so a fresh clone talks to the real platform with no
setup. Requests go through the Vite `/api` proxy in dev (the API has no browser CORS
yet — see `implementation.md` §8). Sign in with the dev test accounts in
`deidos-eats-api/docs/test-accounts.md`, or sign up a new account (real Cognito email
confirmation).

⚠️ **Mock mode is deprecated for running the site** (`implementation.md` §0). It exists
only so the vitest suite can run offline (`.env.test` pins `VITE_API_MODE=mock`). Never
run or demo the site in mock mode: its "user data" is browser-localStorage, so profiles,
addresses, and orders silently diverge from what iOS and the real API see — that bug
class is exactly why live is now the default.

## Commands

```bash
npm run dev        # vite dev server
npm run build      # tsc -b && vite build
npm run lint       # eslint
npm test           # vitest run (single: npx vitest run -t "name")
npm run preview    # serve the production build
```

## Where things live

- `src/theme/tokens.css` — every brand value (colors, radii, shadows, motion). Swap the
  brand here, nowhere else.
- `src/api/` — typed API surface: `live.ts` (real endpoints), `mock/` (offline mock,
  test-harness only), `ws.ts` (order-events socket, live + mock), `types.ts` (contract
  re-exports).
- `src/auth/` — Cognito SRP provider + mock provider behind one interface.
- `src/cart/` — client-held cart (the platform has no server cart), pure logic + context.
- `src/pages/` — home, menu, locations, checkout, order tracking, orders, account, auth.
- `implementation.md` — API capability inventory, integration map, stubs, backend gaps,
  future-features roadmap.
