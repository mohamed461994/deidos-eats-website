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

By default the site runs in **mock mode** (`VITE_API_MODE=mock`): a fully offline,
in-browser mock of the Deidos Eats API with realistic latency, error codes, a simulated
kitchen that advances order status, and localStorage persistence. Any email + a 12-char
password signs in; the confirmation code is any 6 digits.

For **live mode** copy `.env.development.example` → `.env.development`, fill in the dev
API/Cognito/Stripe values and set `VITE_API_MODE=live`. Requests go through the Vite
`/api` proxy in dev. ⚠️ Live mode has backend prerequisites (website Cognito app client,
CORS) — see `implementation.md`.

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
- `src/api/` — typed API surface: `live.ts` (real endpoints), `mock/` (offline mock),
  `ws.ts` (order-events socket, live + mock), `types.ts` (contract re-exports).
- `src/auth/` — Cognito SRP provider + mock provider behind one interface.
- `src/cart/` — client-held cart (the platform has no server cart), pure logic + context.
- `src/pages/` — home, menu, locations, checkout, order tracking, orders, account, auth.
- `implementation.md` — API capability inventory, integration map, stubs, backend gaps,
  future-features roadmap.
