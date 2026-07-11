# implementation.md — wiring the website to the live Deidos Eats API

Contract version at time of writing: `@deidos-eats/contracts` **v0.16.0**.

---

## 0. Mode policy — LIVE API ONLY (decision, 2026-07-06)

**The website uses the real API and real data, exactly like the iOS app. Mock mode is
deprecated for running the site and must never be the mode a person sees.**

Why this is a hard rule: the site originally defaulted to mock whenever `VITE_API_MODE`
was unset. The mock's "user data" lives in browser localStorage, so the account page
showed different profile data than iOS did for the same account — it looked like the
platform had two conflicting user-info endpoints, when in fact there is exactly one
(`GET /me`) and the website simply wasn't calling it. That failure mode (silently faking
data instead of failing loudly) is banned.

What enforces it now:

1. **`live` is the code default** (`src/config.ts`): anything other than an explicit
   `VITE_API_MODE=mock` runs live. An unconfigured build now fails loudly instead of
   silently showing fake data.
2. **`.env.development` is committed** (public dev identifiers only — API URL, WS URL,
   Cognito pool + website client ID, Stripe *publishable* key; never secrets). A fresh
   clone of this repo talks to the real dev API with zero setup. Keep this file current —
   it is the single source of dev configuration, same convention as the dashboard repo.
3. **Mock survives only as the unit-test harness.** `.env.test` (committed) pins
   `VITE_API_MODE=mock` so the vitest suite stays offline and deterministic. That is the
   sole legitimate consumer of `src/api/mock/*` and `src/auth/mock.ts`. Do not add new
   mock features; once live E2E coverage exists, removing mock mode entirely is the
   end state.
4. **Same identity as iOS**: shared buyer pool `eu-west-1_iah1mG6kG` with a
   website-specific app client (`4033eub2av4ulr8mi32gu2evhv`), accepted by the dev API
   verifier (`COGNITO_WEBSITE_CLIENT_ID` — already deployed on the dev Lambda). Same
   pool → same `sub` → same `users` row, so profile edits made on the website are the
   ones iOS sees, and vice versa.

Production builds must be given live values at build time (`.env.production` is not
committed — the committed dev file is dev-only); the full prod config & secrets story,
and the build/runtime guards that stop a mock or origin-less prod bundle, are in **§7.1**.
The remaining backend blocker for a deployed origin is CORS — see §8.

---

## 1. API capability inventory (what the platform supports today)

### Public (no auth) — the pre-login browsing surface
| Endpoint | Used by |
|---|---|
| `GET /restaurants` | Home, menu, locations (single chain = first item) |
| `GET /restaurants/{id}` | (available; not needed — list carries branches) |
| `GET /branches/{id}` | Locations page, checkout (fulfillment/payment config, hours, `isOpen`) |
| `GET /branches/{id}/menu` | Menu page, home highlights |
| `GET /health` | — |
| `POST /webhooks/stripe` | server-to-server only |

### Authenticated buyer surface (Cognito access token, `Authorization: Bearer`)
| Endpoint | Used by |
|---|---|
| `GET /me` | Account (also performs first-login user sync — call it right after sign-in) |
| `PATCH /me` | Account profile form (`fullName`, `phone`) |
| `GET /me/addresses` · `POST /me/addresses` · `DELETE /me/addresses/{id}` | Checkout + account address book (create/delete only — **no update endpoint**) |
| `POST /me/devices` | web push registration (`platform: "web"` is contract-supported; not wired yet) |
| `POST /branches/{id}/cart/validate` | Checkout "Review order" — server reprice (⚠️ requires auth, so no pre-login pricing) |
| `POST /checkout` (+ required `Idempotency-Key` header, 8–200 chars) | Place order; card → returns `paymentIntentClientSecret` |
| `GET /orders` (cursor pagination) | Order history |
| `GET /orders/{id}` | Tracking page (authoritative order state) |
| `POST /orders/{id}/cancel` | Cancel — allowed **only while `status === 'placed'`**, else 409 |

### WebSocket (live order status)
Separate API Gateway WS API: `wss://…execute-api.eu-west-1…/{stage}?token=<access token>`.
Buyers are auto-subscribed to their own orders on `$connect` (no subscribe message).
Messages are lightweight pokes `{type: 'order.placed'|'order.status_changed', orderId,
branchId, status, previousStatus, occurredAt}` — on receipt, refetch `GET /orders/{id}`.
Deployed in **dev** (`wss://s65u292zxd.execute-api.eu-west-1.amazonaws.com/dev`); **no prod
stack yet**. Polling `GET /orders/{id}` remains a supported fallback.

### Key domain rules the UI honors
- **Money**: integer euro cents everywhere; `Currency` = EUR only.
- **VAT**: basis points (1350 = 13.5%), VAT-inclusive prices, snapshotted at checkout;
  `PricedCart.vatBreakdown` groups by rate.
- **Lifecycle**: `placed → accepted → preparing → (ready | out_for_delivery) → completed`,
  plus `cancelled` / `rejected`. `refunded` as an order status is deprecated — refund state
  lives in `paymentStatus` (`requires_payment → paid → refund_pending → refunded`, or `failed`).
- **Fulfillment**: buyers use `collection` / `delivery` (walk_in/takeaway are POS-only).
  Delivery fee is tiered (base fee within `deliveryBaseRadiusKm`, `deliveryPerKmCents`
  beyond, hard stop at `deliveryRadiusKm`) and computed server-side from the saved
  address's Eircode; the client never sends coordinates.
- **Addresses**: Eircode is mandatory and pattern-validated; order snapshots keep the
  address even if it's later deleted.
- **Payment**: Stripe PaymentIntent, immediate capture, created by `POST /checkout`. Cash
  is per-branch opt-in (`payment.cashEnabled`). No stored-card fields anywhere, by contract rule.
- **Idempotency**: same `Idempotency-Key` on checkout **resumes** the same order/PaymentIntent
  (the site keeps one key per checkout attempt-set — `src/lib/idempotency.ts`).

### Confirmed absent from the API (v0.16.0) — see §8/§9
Server-side cart · favorites · promo codes/buyer discounts · scheduled orders · ratings ·
search · tips · ETA/driver tracking · buyer-facing address autocomplete or delivery quote
(both exist **staff-only**) · address update (PATCH) · payment-method management · account
deletion.

---

## 2. Integration map (component/flow → endpoint)

All API access goes through `src/api/index.ts`, which picks the **live** (default) or
**mock** (test-harness only, §0) adapter once at startup from `VITE_API_MODE`.
Components never know which is active.

| Flow / component | Calls | Notes |
|---|---|---|
| `useRestaurant()` (home, menu, locations) | `GET /restaurants?limit=50` | Single chain: pinned `VITE_RESTAURANT_ID` or first item; cached 5 min |
| `useBranch(id)` (locations, checkout) | `GET /branches/{id}` | hours, `isOpen`, fulfillment + payment config |
| `useMenu(id)` (menu, home highlights) | `GET /branches/{id}/menu` | 60s stale time |
| Item dialog → cart | — (client-side) | cart is client-held; modifier min/max enforced in UI, re-validated server-side |
| Checkout "Review order" | `POST /branches/{id}/cart/validate` | auth required; shows server totals incl. VAT bands + delivery fee |
| Checkout "Place order" | `POST /checkout` + `Idempotency-Key` | request: `{branchId, fulfillmentType, addressId?, lines, paymentMethod, note?}` |
| Payment step (card) | Stripe Payment Element with `paymentIntentClientSecret` | `src/components/stripe-payment.tsx`, lazy-loaded |
| Tracking page | `GET /orders/{id}` + WS poke → refetch | cancel via `POST /orders/{id}/cancel` while `placed` |
| Orders page | `GET /orders` | active vs past split client-side |
| Account profile | `GET /me`, `PATCH /me` | `GET /me` doubles as first-login sync |
| Address book (account + checkout) | `GET/POST /me/addresses`, `DELETE /me/addresses/{id}` | client Eircode pre-validation mirrors the contract pattern |
| Error handling | all | `Error` envelope `{code, message, details?}` → `ApiError`; buyer-facing copy in `src/api/errors.ts` keyed by `code` |

**Auth handling**: `src/api/http.ts` holds a token-provider hook; `src/auth/context.tsx`
registers it. Live provider (`src/auth/cognito.ts`) = direct Cognito SRP via
`amazon-cognito-identity-js` (same flow as dashboard/iOS — no hosted UI; the pool's
clients have OAuth disabled). Sign-up → email confirmation code → sign-in; password
policy min 12 + all classes. Confirming an account does **not** create a session (real
Cognito behaviour) — the app signs in right after (fresh signup) or routes to sign-in
(re-entry); a throttled "Resend code" action re-sends the email code. On sign-in the app
prefetches `GET /me` (first-login user sync, fire-and-forget). 401s surface as "session
expired" copy.

## 3. State management

- **Server state**: TanStack Query, keys in `src/api/queries.ts` (`restaurant`, `branch/x`,
  `menu/x`, `orders`, `order/x`, `me`, `addresses`). Auth-gated queries are `enabled` only
  when signed in; sign-out `clear()`s the cache, sign-in invalidates it.
- **Cart**: client-held by design (no server cart). Pure reducer (`src/cart/cart.ts`,
  unit-tested) + context, persisted to `localStorage['puca-cart-v1']`. One branch per cart;
  cross-branch adds require explicit confirmation. Cart totals are estimates; the priced
  cart from validate/checkout is authoritative and any input change expires the quote
  (signature check in `src/pages/checkout.tsx`).
- **Branch selection**: `localStorage['puca-branch-v1']` is the single source of truth via
  `useSyncExternalStore` (`src/lib/branch-selection.ts`) — `getSnapshot` reads storage fresh so
  the store can't drift out of sync. `resolveSelectedBranch(branches, storedId)` never silently
  defaults to `branches[0]`: it returns the stored id only if it still exists, auto-selects the
  sole branch of a single-branch restaurant, and otherwise returns `null` (which shows the gate —
  see the branch-clarity note below). A stale/removed stored id resolves to `null`, not a wrong
  branch.
- **Live updates**: `src/api/ws.ts` — WS connect with `?token=`, exponential backoff
  reconnect (2s→30s), poke → `invalidateQueries(order/x)`. Mock mode replays the simulated
  kitchen's events through the same interface.

## 4. Payment flow, step by step (card)

1. User reviews cart → `POST /branches/{id}/cart/validate` → server-priced totals shown.
2. "Continue to payment" → `POST /checkout` with `Idempotency-Key` → order created in
   `placed`, `paymentStatus: requires_payment`; response carries `paymentIntentClientSecret`.
3. Payment Element (`@stripe/react-stripe-js`) mounts with that client secret;
   `automatic_payment_methods` means card + Apple Pay + Google Pay appear as available.
   Publishable key: `VITE_STRIPE_PUBLISHABLE_KEY` (baked at build, like iOS's xcconfig).
4. `stripe.confirmPayment` with `return_url` = `/orders/{orderId}`; redirect-less methods
   navigate there directly.
5. Stripe webhook → SQS → worker marks `paymentStatus: paid` and emits `OrderPlaced` →
   kitchen sees it; WS pokes the tracking page. The page shows "Awaiting payment" until
   the webhook lands (usually <2s).
6. Retry safety: same `Idempotency-Key` re-returns the same PaymentIntent; a failed intent
   leaves the order `requires_payment` (payment can be retried with the same secret).
7. Refunds: buyer cancel while `placed` → API emits `RefundRequested` → refunds worker →
   `paymentStatus: refund_pending → refunded` via `charge.refunded` webhook. UI copy
   reflects both stages.

**Cash**: `paymentMethod: 'cash'` (only when branch `cashEnabled`) skips Stripe entirely;
order is placed immediately and the site navigates straight to tracking.

### 4.1 Branch clarity — never order from the wrong branch

The chain has multiple branches per restaurant (currently Ranelagh/Dublin and Washington
Street/Cork). The site keeps two separate concepts, as before: the **browsing branch**
(`useSelectedBranch`, localStorage) and the **cart branch** (`cart.branchId`). Selecting a branch
anywhere only sets the browsing branch and **never touches the cart**; the cart changes branch only
via the existing add-time conflict confirm or an explicit "switch & start fresh" confirm at
checkout. Guardrails:

- **Menu gate** (`src/pages/menu.tsx`): with more than one branch and no explicit choice, the menu
  is replaced by an inline `BranchChooser` ("Which Púca is yours?") instead of silently defaulting
  to the first branch. Skeletons show while the restaurant query is pending, so the gate never
  flashes. Once a branch is effective, a compact "Ordering from … · Open/Closed" row with a
  **Change branch** button (opens the picker dialog) replaces the old radio pills.
- **Header chip** (`src/components/layout/header.tsx`): an always-visible `MapPin` + branch-name
  chip (desktop after the nav, compact on mobile, 44px hit target). No valid selection → "Choose
  branch". Opens the same `BranchPickerDialog`.
- **Shared component** (`src/components/branch-picker.tsx`): one `BranchChooser` (cards with open
  state, town + county, collection/delivery info incl. "up to X km", optional **Use my location**
  → distances via `haversineKm` + a "Nearest" badge; location is never requested automatically and
  coordinates are never logged or stored) and one `BranchPickerDialog` wrapping it in the `Modal`.
  In `moveOrder` mode (checkout) switching to a different branch confirms and clears the cart first.
- **Checkout guardrails** (`src/pages/checkout.tsx`): a prominent branch card with the full address
  + maps link and **Change branch**; for collection it reads "You'll collect from here" (address is
  the star). Delivery shows a **warn-only** county-mismatch banner (`CountyMismatchNotice`,
  `role="alert"`) when the address county ≠ branch county — **Place order stays enabled** (the
  server is the authority on range), with a one-tap "Switch to {branch}" when another branch sits
  in the address's county.
- **Order tracking** (`src/pages/order-tracking.tsx`): collection orders show a "Collect from"
  address + maps link (`useBranch(order.branchId)`); delivery orders are unchanged.

Small shared helpers: `src/lib/distance.ts` (`haversineKm`/`formatKm`, `sameCounty` normalization),
`src/lib/maps.ts` (`mapsUrlFor`, extracted from `locations.tsx` and reused by checkout/tracking).

## 5. Mock leftovers — test harness only (see §0)

**Live is the default and only supported mode for running the site.** As of 2026-07-06
the dev configuration is committed (`.env.development`: live mode, dev API/WS URLs,
shared buyer pool + website app client, Stripe test publishable key), so nothing below
is "pending setup" anymore — the mock code paths survive solely because the vitest
suite runs against them (`.env.test`).

| Mock remnant | Where | Status / end state |
|---|---|---|
| Mock API adapter | `src/api/mock/*` | Test harness only. Remove once live E2E coverage replaces the mock flow tests |
| Mock auth provider | `src/auth/mock.ts` | Test harness only — real SRP flow (`src/auth/cognito.ts`) is what runs |
| Demo payment button | checkout page, mock branch | Only reachable in test mode; live renders the real Payment Element (`src/components/stripe-payment.tsx`) |
| Simulated kitchen + WS replay | `src/api/mock/store.ts`, `src/api/ws.ts` mock branch | Test harness only — real status changes come from staff actions via the dashboard |
| Brand imagery (Unsplash) | `src/lib/brand.ts`, mock menu | Unrelated to API mode — real photography via CloudFront menu images once a real chain brand exists |
| Web push registration | not wired | See roadmap §9 — `POST /me/devices` with `platform:'web'` exists; needs a service worker + a web-push sender in the push worker |

Nothing is faked silently: mock-only UI is labeled ("Demo mode", "Demo payment — no real
Stripe"), mock modules are marked `MOCK` in their headers, and an unconfigured build
fails loudly (live default) instead of falling back to fake data.

## 6. Env vars / config

`.env.development` is **committed** (public dev identifiers only — see §0). Current
values, kept in sync with the deployed dev platform:

| Var | Dev value (committed) | Notes |
|---|---|---|
| `VITE_API_MODE` | `live` | live is also the code default; `mock` is test-only (`.env.test`) |
| `VITE_API_BASE_URL` | `https://izio5wfs4g.execute-api.eu-west-1.amazonaws.com/dev` | dev proxy target (`/api` in the browser); prod has no URL yet |
| `VITE_WS_URL` | `wss://s65u292zxd.execute-api.eu-west-1.amazonaws.com/dev` | dev WS; no prod stack yet |
| `VITE_COGNITO_USER_POOL_ID` | `eu-west-1_iah1mG6kG` | shared buyer pool (same as iOS) |
| `VITE_COGNITO_CLIENT_ID` | `4033eub2av4ulr8mi32gu2evhv` | website's own app client — do NOT reuse the iOS/dashboard client IDs |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (same key iOS dev uses) | public by design; baked at build |
| `VITE_RESTAURANT_ID` | (empty) | optional pin; defaults to first restaurant |

Dev test accounts: `deidos-eats-api/docs/test-accounts.md`.

## 7. Build & deploy notes (AWS)

⚠️ **Everything here needs explicit per-action approval under the workspace's AWS
deployment boundary — nothing below has been provisioned.**

- Artifact: `npm run build` → static `dist/` (SPA). Cheapest correct hosting on this
  platform: **S3 + CloudFront** (`PRICE_CLASS_100`, like the platform's existing assets
  distribution) with SPA fallback of 403/404 → `/index.html`. No server, scale-to-zero cost
  profile — a few cents/month at dev traffic.
- CDK: a small `WebsiteStack` in `deidos-eats-aws-cloud` (S3 bucket private + OAC,
  CloudFront, optional custom domain later). Deploy via the existing GitHub Actions OIDC
  roles — a `deploy-website.yml` workflow uploading `dist/` + CloudFront invalidation.
  Follow the naming convention `deidos-eats-{env}-website`.
- The API stays on its own origin; the site calls it cross-origin (hence CORS, §8.2). Env
  values are baked at build time per environment (same pattern as the dashboard).
- Cost note: no new always-on resources; CloudFront+S3 only. Do not add an interface
  endpoint / proxy for this.

### 7.1 Production config & secrets — how we avoid the dev env problem in prod

Committing `.env.development` (§0) is a **dev-only** convenience. It must never leak into a
production deploy. There are two distinct risks; each has its own guard so neither depends
on someone remembering a rule.

**Risk 1 — shipping mock / fake data** (the original bug: an unset `VITE_API_MODE` fell back
to mock, so the account page showed browser-local fake data while iOS showed the real
`GET /me`). Three layers, defense in depth:

1. **Code default is `live`** (`src/config.ts`) — an unset mode can never mean mock again.
2. **Build fails loud** — `vite build` (production mode) throws if `VITE_API_MODE=mock`, or
   if it's `live` with no `VITE_API_BASE_URL` (`vite.config.ts`). CI cannot produce a mock or
   origin-less prod bundle. A local `npm run build` with no prod env is unaffected (unset
   mode trips neither check).
3. **Runtime backstop** — a production bundle throws on load if it is somehow in mock mode
   (`src/config.ts`, gated on `import.meta.env.PROD`). It white-screens with a console error
   rather than render fake data. *(So the deploy smoke check must actually load the page /
   read the console — confirming files were emitted is not enough.)*

**Risk 2 — committing or publishing a secret.** `.env.development` is committed precisely
*because* it holds only public identifiers. Two rules keep prod safe:

- **Committed dev values are dev-only.** Dev API/WS URLs, the dev Cognito pool + dev website
  app client, and the Stripe **test** key. Never deploy prod with them — prod has its own.
- **`VITE_*` is public.** Vite bakes every `VITE_*` var into the client bundle that ships to
  browsers, so a "secret" in a client env file is published **even if the file is
  gitignored**. This SPA needs *no* secrets: only URLs, Cognito pool/client IDs, and the
  Stripe **publishable** key (`pk_live_…`). Secret keys (`sk_live_…`), webhook secrets
  (`whsec_…`), DB passwords, and AWS creds never appear in any `VITE_*` var — they live
  server-side in Secrets Manager and are read by the API, not the site.

**How prod actually gets its config.** `.env.production` is **gitignored**;
`.env.production.example` documents the shape. The `deploy-website.yml` GitHub Actions job
supplies the prod values (public identifiers, from repo **variables** — not secrets) at
`vite build` time, then uploads `dist/` to S3 + invalidates CloudFront. Same
build-time-baking pattern as the dashboard and iOS. No prod env file is committed, and
nothing secret is ever handed to the frontend build. Prod prerequisites still open: a prod
Cognito website app client, the prod API/WS stack, and the website origin on the API's CORS
allowlist (§8.2).

## 8. Backend gaps that block full live functionality (ordered TODO)

1. ~~**Cognito app client for the website**~~ ✅ **DONE (2026-07-06)** — the pool has a
   website app client (`4033eub2av4ulr8mi32gu2evhv`, committed in `.env.development`),
   and the dev API Lambda already carries `COGNITO_WEBSITE_CLIENT_ID` in its accepted
   verifier list (`createAccessTokenVerifier`). Authed flows work in dev through the
   Vite proxy.
2. **CORS** *(blocks all browser calls outside the Vite proxy)* — two halves:
   (a) API Gateway `allowedOrigins` must include the website origin(s), and `allowHeaders`
   must add **`Idempotency-Key`** (checkout preflight fails without it);
   (b) the Fastify app sets no CORS response headers at all today — add `@fastify/cors`
   with the same origin allowlist (preflight mocks alone are not enough for actual
   responses). Dev-only workaround used now: the Vite `/api` same-origin proxy.
3. **Prod WebSocket stack** — the WS API exists in dev only; prod tracking would fall back
   to polling `GET /orders/{id}`. Also the plan's own follow-up: replace `?token=` query
   auth with a ticket/subprotocol before prod.
4. **Buyer-facing address autocomplete** *(UX gap, not a hard blocker)* — the HERE proxy
   exists staff-only (`/staff/branches/{id}/address-suggest`). A buyer variant (contract
   change → `GET /branches/{id}/address-suggest` or `/me/address-suggest`) would fix the
   biggest checkout friction: hand-typed addresses + Eircodes.
5. **Address update endpoint** — contract has create/delete only; editing an address today
   means delete + re-create. Add `PATCH /me/addresses/{id}`.
6. **Pre-login cart pricing** — `cart/validate` requires auth, so guests see client-side
   estimates until sign-in. Either allow anonymous validate (public, branch-scoped,
   rate-limited) or accept the estimate UX.
7. **Custom domains** — neither API nor website has one; the contract's `servers` block is
   raw API Gateway URLs. Needed before any public launch (also simplifies CORS to one
   stable origin per env).
8. **`GET /orders` list invalidation via WS** — works (poke → invalidate), but messages
   only fire for status changes; a completed payment (`paymentStatus` flip) doesn't emit a
   buyer-visible event, so the tracking page also refetches on window focus. Consider a
   `payment.updated` WS message type.
9. **Delivery-radius enforcement at buyer checkout** *(recommended)* — `deliveryRadiusKm` is public
   on the branch DTO but **never enforced** for buyer orders: `cart/service.ts` never reads it and
   `delivery-fee.ts` fails safe to the base/tiered fee, so an out-of-range delivery (e.g. a Cork
   address ordering from the Dublin branch) is accepted. The website added a **warn-only**
   county-mismatch banner (§4.1, chosen as website-only for now), but the real fix is server-side:
   enforce `deliveryRadiusKm` in `cart/service.ts` pricing and reject with a contract error reason
   (e.g. `out_of_delivery_range`) so iOS and the website both get a hard, authoritative stop.

## 9. Future features roadmap (plan only — not built)

Ordered by value-for-effort for a single-chain ordering site:

| Feature | Frontend | Backend work required |
|---|---|---|
| **Web push notifications** ("your order is ready") | service worker + permission prompt at first order; register via existing `POST /me/devices` (`platform:'web'`) | extend `push-notifications` worker to send Web Push (VAPID keys in Secrets Manager) alongside APNs/FCM |
| **Scheduled orders** ("collect at 18:30") | time picker in checkout, bounded by opening hours | contract: `scheduledFor` on checkout/order; API validation + KDS/dashboard surfacing; decide kitchen lead-time rules |
| **Favorites / reorder** | "Order again" from history (client-side re-add is possible today but breaks silently on menu changes); proper favorites on menu items | `POST/DELETE /me/favorites` + list; or a `POST /orders/{id}/reorder` that returns a validated cart |
| **Promo codes** | code field in checkout + discount line in totals | new contract shapes (`promoCode` on checkout, discount lines on PricedCart/Order), redemption rules engine, staff/admin CRUD — POS discounts are deliberately separate |
| **Buyer address autocomplete** | swap the manual address form for typeahead (reuse suggestion coords to skip re-geocoding, like the POS plan) | expose a buyer-scoped HERE proxy endpoint (§8.4) |
| **Ratings** | post-completion prompt on tracking page; stars in history | `POST /orders/{id}/rating` + aggregates; moderation story |
| **Live ETA** | richer tracking ("ready ~19:05") | kitchen-set prep-time estimates on accept (dashboard change) + `estimatedReadyAt` on Order + WS updates |
| **Guest checkout** | phone/email capture instead of account | significant: anonymous Cognito or signed guest tokens, order claim flow — revisit after conversion data |
| **Loyalty** ("9th pizza free") | account page card + progress | order-count aggregation + redemption as a payment adjustment; depends on promo infrastructure |

## 10. Verification done

- `npm run build`, `npm run lint`, `npm test` all green (21 tests: cart reducer, money,
  Eircode, hours, and an end-to-end mock ordering flow incl. lifecycle, idempotent
  checkout, cancel rules, refund progression, WS event sequence).
- Screenshot-verified at 390×844 and 1440×900: home, menu, checkout (build step), live
  tracking (mid-lifecycle), sign-in. The card payment step is covered by the mock flow
  test; the real Payment Element remains untested until live-mode prerequisites land
  (§8.1–8.2). All Unsplash image URLs verified HTTP 200 and visually checked.
- Accessibility: WCAG AA contrast (ink 7:1+, muted ≥4.5:1, white-on-basil/ember fills),
  keyboard operability (Radix dialogs, real buttons/labels/fieldsets, skip link), visible
  ember focus ring, `aria-live` on order status and toasts, 44px touch targets,
  `prefers-reduced-motion` fallbacks for every animation.
