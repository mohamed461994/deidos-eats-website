# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Part of the **Deidos Eats** platform. See `../MASTER_BUILD_PLAN.md`, `../CI.md`, and `../CLAUDE.md`
> for the cross-repo picture, and `../WEBSITE_MARKETPLACE_PLAN.md` / `../HOME_ADMIN_PLAN.md` /
> `../STAFF_ACCOUNTS_PLAN.md` for the multi-repo feature plans that touch this app. This repo is the
> **buyer web app + brand site + staff/admin panel**; it consumes the `deidos-eats-contracts` OpenAPI
> types and talks to the deployed `deidos-eats-api`.
>
> Two more docs live in this repo and are the design source of truth — read them before UI work:
> **`PRODUCT.md`** (register model, users, brand levels) and **`DESIGN.md`** (tokens, components).

## What this repo is

Vite + React 19 + TypeScript + Tailwind v4 + TanStack Query + react-router 7. The public buyer
surface of Deidos Eats (discover → browse → cart → checkout → live order tracking) **plus** a
staff/admin panel under `/admin`. Placeholder brand: **Púca Pizza** (platform identity "Deidos Eats"
is a working name — everything is swappable semantic tokens, no fixed brand yet).

Auth is **AWS Cognito via SRP** (`amazon-cognito-identity-js`, no hosted UI) against the shared buyer
pool — same pool/`sub` as iOS, so the same `users` row and profile everywhere. The website has its own
app client (`VITE_COGNITO_CLIENT_ID`), accepted by the API verifier (`COGNITO_WEBSITE_CLIENT_ID`).

## Commands

```bash
npm run dev      # vite dev server (http://localhost:5173) against the LIVE dev API (Vite proxies /api/*)
npm run build    # tsc -b && vite build  (production build FAILS on a mock/origin-less bundle — see rules)
npm run lint     # eslint
npm test         # vitest run   (single: npx vitest run src/path/to/file.test.tsx  or  -t "name")
```

Setup: needs a local clone of `deidos-eats-contracts` linked via the npm **file** dependency
(`@deidos-eats/contracts": "file:../deidos-eats-contracts"` — a symlink, so a `npm run build` in the
contracts repo makes new types visible immediately). `.env.development` is committed (public
identifiers only — see the env rule); dev-only login prefill goes in `.env.development.local`
(gitignored).

## Architecture

### Live vs mock (the LIVE-API-only policy)

`src/config.ts` derives `isMock = VITE_API_MODE === 'mock'`. **Committed `.env.development` sets
`live`** so every clone (and the dev server) hits the real dev API. **Mock mode is vitest-only**
(`.env.test` sets `mock`); it exists to exercise the same UI states without a network, never to serve
users fake data. Two guards enforce this: `vite.config.ts` fails a mock production build, and
`config.ts` throws at load time if a mock bundle somehow reaches `import.meta.env.PROD`. (This is the
fix for the old "site showed browser-local fake user data instead of the real `GET /me`" bug.)

### API layer (`src/api/`)

- `http.ts` — `apiRequest()`: fetch wrapper, injects the Cognito access token (from the auth provider
  via `setAccessTokenProvider`), maps non-2xx to `ApiError` (`{ code, message, details? }`).
- `types.ts` — the **only** module that imports the generated contract types; re-exports named aliases
  (`User`, `Order`, `AdminStaffMember`, …). Feature code imports from here, never from `generated/`.
- `index.ts` (`api`) and `admin-api.ts` (`adminApi`) — dispatchers that pick `isMock ? mock : live`
  per function. `live.ts`/`admin-live.ts` call `apiRequest`; `mock/` implements the same shapes over
  an in-browser store.
- `mock/` — `store.ts` (per-account localStorage profiles/addresses/orders + a "kitchen" that advances
  order status on timers), `data.ts` (seed restaurants/branches), `admin*.ts` (admin-data fakes),
  `api.ts` (the mock API surface; `resetMockApiForTests()` + `seedStaffForTests()` drive tests).

### Auth (`src/auth/`)

One `AuthProvider` interface (`provider.ts`), two implementations selected by `isMock`: `cognito.ts`
(real SRP) and `mock.ts` (test-only). `context.tsx` exposes `useAuth()` and owns session state
(`status`, `role`, `staffMfaStep`, `staffVerified`). **The role always comes from the API
(`GET /me`), never from token groups** — token groups are only a client-side pre-gate on the staff
sign-in page.

- **Buyer** `signIn` rejects every Cognito challenge and signs out any staff account (buyers use
  `/signin`; staff must use the designated staff page).
- **Staff** `beginStaffSignIn` (used only by `src/admin/staff-sign-in.tsx`, at the config-driven
  `VITE_STAFF_SIGN_IN_PATH`): password → shared `staffAuthCallbacks` routing →
  - `admin`/`restaurant_manager` → **mandatory TOTP** (enroll if none, else challenge) → `/admin`;
  - `restaurant_staff` (kitchen) → terminal **`staffReady`** card (they work on the dashboard/Orderpad,
    not this panel) — signed out, no panel session;
  - `NEW_PASSWORD_REQUIRED` (admin-created temp-password accounts) → **`completeStaffNewPassword`** sets
    the user's own password, then re-enters the same routing (enrollment / ready). This is the single
    activation point for every staff account.

### Admin panel (`src/admin/`)

Lazy-loaded, role-gated (`app.tsx` `AdminApp` guard + `PanelShell`). Sections in `SECTIONS`; the
`manager` flag decides visibility: **admins see everything; restaurant_managers see ONLY Discounts**
(scoped to branches where they hold a `manager` membership, from `GET /me/branches`). **UI gating is
cosmetic — the server is the only security boundary.** Pages: `discounts`, `banners`, `oven`,
`content`, `restaurants`, `branches`, `staff`. Shared primitives in `shared.tsx`
(`PageHeader`/`AdminPage`/`AdminCard`/`ConfirmAction`/`ImageUploadField`/`HoursEditor`); data hooks in
`queries.ts` (`adminQueryKeys` + `use*` query/mutation hooks).

- **Staff** (`staff.tsx`, admin-only) — create/promote accounts, edit per-branch memberships, reset
  passwords, disable/enable. Create/reset return a **one-time temporary password** shown once in a
  modal and held only in component state (never written to the query cache).

### The rest

- Routing: `src/lib/routes.ts` (`paths` builders — branch lives IN the menu URL on purpose). Buyer
  pages in `src/pages/`. `App.tsx` wires routes; `/admin/*` and the staff sign-in path are separate.
- UI kit: `src/components/ui/` (`button`, `badge`, `field` incl. `SelectField`, `dialog`/`Modal`,
  `toast`, `skeleton`), `src/components/states.tsx` (`EmptyState`/`ErrorState`).
- Theming: **semantic tokens only** in `src/theme/tokens.css` (consumed via Tailwind v4 `@theme` in
  `src/index.css`). No scattered hex — use tokens (`bg-surface`, `text-muted`, `bg-basil-tint`, …).

## Rules and gotchas

- **Two registers, never blurred** (see `PRODUCT.md`): the home/discovery/`/r/:slug` surfaces are
  **brand** register (the food sells; platform chrome stays quiet); checkout/orders/account are
  **product** register; the `/admin` panel is quiet product-register tooling. Match the surface.
- **Contracts win.** All API shapes come from `@deidos-eats/contracts` pinned to a git **tag**. Need a
  new field? Change the contract first, `npm run build` there, tag, then consume it here.
- **Live-API-only**: never make mock the default; never let a mock bundle ship. Mock stays
  `.env.test`-only.
- **Committed env files: public identifiers ONLY** — API/WS URLs, Cognito region/pool/**client** IDs,
  Stripe **publishable** (`pk_*`) key, app version. Never secret keys (`sk_*`), webhook secrets, or
  passwords. Remember `VITE_*` is baked into the public browser bundle.
- **Server is the security boundary.** Role/section gating in the UI is cosmetic; every admin/staff
  endpoint is server-enforced (`admin` group + `staff_memberships` on the API). Don't rely on
  client-side checks for anything that matters.
- **Never log** passwords, tokens, refresh tokens, or payment/card data. One-time temporary passwords
  live only in transient component state.
- Keep diffs minimal and scoped; don't create commits/branches/PRs (the user owns git state — see the
  root `../CLAUDE.md`). Invoke the `impeccable` skill before building/reshaping UI.
