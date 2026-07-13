# Design

Visual system for the **Deidos Eats** buyer marketplace. Two brand levels (see PRODUCT.md):
the **platform** chrome (Deidos Eats) and each **restaurant's** API-driven brand inside
`/r/:slug`. There is **one platform visual theme** today — per-restaurant theming (accent
overrides on the `/r/:slug` subtree) is deferred. All token values below are the single
source of truth and live in `src/theme/tokens.css`; components consume semantic tokens only.
Refresh with `/impeccable document` as real components land.

## Mood — the platform theme

**Warm market hall.** Confident, appetite-forward, hand-built warmth — a well-run food market
where the produce (each restaurant's food photography) is the hero and the building (the
platform chrome) is a calm, characterful frame. The theme reads as *casual premium*: committed
colour and confident display type at neighbourhood prices, never stiff, never shouty. The
platform never out-shouts the restaurant it is framing.

*(This theme began as the "wood-fired basil" placeholder brand and is retained as the platform
theme — the palette and type are deliberately generic-warm, not tied to any one restaurant. A
real platform identity swaps the token block; a restaurant's personality arrives through its
API content — name, tagline, logo, hero image — and, later, an optional per-restaurant accent.)*

## Color

Strategy: **Committed** on brand/discovery surfaces (basil green carries hero framing, nav
accents, CTAs), **Restrained** on task surfaces (checkout, tracking, account: white + ink +
green for primary actions only). Pure white background — warmth lives in the brand colours,
photography, and type, never in a beige wash (explicit anti-reference).

| Token | OKLCH | Role |
|---|---|---|
| `--color-bg` | `oklch(1 0 0)` | Page background. Pure white, no hidden warmth. |
| `--color-surface` | `oklch(0.956 0.004 140)` | Cards, panels, wells — bg pulled slightly toward ink. |
| `--color-ink` | `oklch(0.24 0.02 140)` | Body text. ≥7:1 on bg. Carries a whisper of the brand hue. |
| `--color-muted` | `oklch(0.47 0.02 140)` | Secondary text. ≥4.5:1 on bg. |
| `--color-primary` | `oklch(0.40 0.13 143)` | **Basil** — deep platform green. CTAs, links, nav, brand fills. White text on fills. |
| `--color-primary-deep` | `oklch(0.30 0.10 143)` | Basil pressed/hover; drenched brand sections. |
| `--color-accent` | `oklch(0.62 0.19 38)` | **Ember** — heat. Appetite highlights, "popular"/"open" pulses, live-status. White text on fills. |
| `--color-crust` | `oklch(0.87 0.06 85)` | Baked gold. Subtle tints, dividers on green. |
| `--color-paper-on-deep` | `oklch(0.97 0.01 110)` | Text/surfaces sitting on `primary-deep` drench sections. |

Semantic states: `--color-success` = primary basil family; `--color-error`
`oklch(0.55 0.19 25)`; `--color-warning` `oklch(0.70 0.15 70)`; `--color-info` = ink at 70%.
Focus ring: `--color-accent` 2px offset 2px — visible on both white and green.

Rules: white text on all saturated mid-luminance fills (basil, ember). No gradient text, no
side-stripe accents, no beige body backgrounds. Green-on-cream is a named AI attractor zone —
the drench direction here is **paper-on-deep-basil**, never basil-on-cream. When per-restaurant
accents land, they override only inside `/r/:slug`; platform chrome always keeps the theme green.

## Typography

Single family, committed contrast: **Bricolage Grotesque Variable** (optical size axis 12–96,
weights 200–800, via `@fontsource-variable/bricolage-grotesque`). Warm, chunky, slightly
irregular grotesque — a hand-painted fascia, not a startup deck. Fallback stack:
`system-ui, 'Segoe UI', sans-serif`.

- **Display** (discovery + restaurant heroes, section heads): opsz high, weight 700–800, tight
  leading (1.02–1.1), letter-spacing −0.02em (floor −0.04em). Fluid: hero
  `clamp(2.75rem, 8vw, 5.5rem)`; section `clamp(2rem, 4.5vw, 3.25rem)`. `text-wrap: balance`.
- **UI/body** (menu, checkout, account): fixed rem scale, ratio ~1.2 — 13 / 15 / 16 / 19 / 23 /
  28px. Weight 400 body, 550 labels, 650 headings. Line-height 1.5 body, 1.3 dense UI. Prices
  and order numbers: `font-variant-numeric: tabular-nums`.
- Restaurant names and menu item names get display warmth (weight 650, opsz mid); descriptions
  and taglines stay quiet (15px, muted).

## Spacing, shape, elevation

- Spacing: 4px base scale (4/8/12/16/24/32/48/64/96). Brand/discovery sections breathe with
  `clamp(4rem, 10vw, 8rem)` vertical rhythm; task screens run compact (16/24).
- Radius: hand-built generosity — `--radius-sm` 10px (inputs, tags), `--radius-md` 16px (cards,
  sheets), `--radius-full` pills (CTAs, filters). Photography corners 16px; large feature cards
  20–24px.
- Elevation: shadows soft and warm-neutral, two levels only (raised `0 1px 2px / 6%`, floating
  `0 8px 30px / 12%`). No glassmorphism.
- Z-scale: `dropdown(10) < sticky(20) < backdrop(30) < sheet/modal(40) < toast(50) < tooltip(60)`.

## Imagery

Food and restaurant photography is the hero and is non-negotiable: warm side-light, real steam
and mess, never sterile catalog shots. **Restaurant hero and logo images come from the API**
(`heroImageUrl`, `logoUrl` on `Restaurant`); menu photos come from the menu payload. When a
restaurant has no hero/logo set, fall back to a neutral platform placeholder (`src/lib/brand.ts`)
and the restaurant name — never a broken image, never another restaurant's photo. Alt text
carries meaning (hero: `heroImageAlt` from the API; logo alt = restaurant name). `aspect-ratio`
boxes + `object-fit: cover`; LQIP background tint (`--color-surface`) while loading.

## Motion

Purposeful, warm, quick. Easing `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint family)
everywhere; durations 150–250ms in task flows, up to 600ms for a single orchestrated hero
reveal. Signature moves:

- **Home / restaurant hero**: one page-load choreography (headline rise + photo
  scale-settle; on home the hero copy and location control rise in sequence, and strip/feed
  cards stagger ≤40 ms with a capped index). Content visible by default; motion enhances,
  never gates.
- **Add-to-cart**: item photo arcs toward the cart pill; cart count bumps. The product's one
  indulgence — it confirms state.
- **Order tracking**: status steps advance with a draw-line + ember pulse on the active step.
  Live region announces changes.
- Sheets/drawers slide with transform only; list items never stagger more than 40ms apart.

`prefers-reduced-motion`: all of the above become crossfades or instant state changes. No
parallax, no bounce, no scroll-jacking.

## Components

shadcn/ui (Radix) primitives restyled through tokens — same stack as the dashboard. Core
vocabulary: pill Button (primary basil / ghost / destructive), **RestaurantCard** (the
restaurant tile: hero, name, tagline, precise availability badge — e.g. "1 of 2 locations
open" — links to `/r/:slug`; lives on `/restaurants` and cross-surface uses),
**BranchCard** (the home feed unit: restaurant brand + branch name/town, open state,
collection/delivery badges, distance when located — the whole card is one link to that
branch's menu), **item strip cards** (From-the-oven / Discounted: photo-led, restaurant
attribution, price or ~~was~~/now, straight to the branch menu), **LocationControl**
(geolocate + town pick, header-level), **PriceWasNow** (struck base + emphasized promo
price, shared by strips and menu), BranchChooser/BranchPickerDialog, Sheet (cart on
mobile), Dialog (item detail on desktop, full-screen sheet on mobile), Tabs (menu
categories, sticky under header), Badge (availability + status), Stepper (order tracking),
Skeleton loaders (photo-shaped, never spinners mid-content), Toast (bottom, above cart bar).
Every interactive component ships default / hover / focus-visible / active / disabled / loading
/ error states. Empty and unavailable states teach ("This restaurant is coming soon", "No
locations yet", "Your cart is empty — ready when you are").

## Layout

Mobile-first, one-thumb reach: persistent bottom cart bar on mobile (sticky, safe-area aware,
**always names the cart's restaurant**), max content width 1200px desktop, menu grid
`repeat(auto-fit, minmax(280px, 1fr))`.

- **Home (`/`)** — the admin-managed, **branch-first** market hall (supersedes the earlier
  two-feature-card restaurant discovery, which lives on at `/restaurants`, unlinked). Top to
  bottom: hero copy + the **location control** (geolocation or a town pick — sorting aid,
  never a gate), admin **banners**, a **"From the oven"** item strip, a **"Discounted"**
  strip (server-priced ~~was~~/now), then the **branch feed** — every published restaurant's
  branches, server-sorted nearest-first when located (with "x.x km") or open-first when not.
  Every card carries its restaurant's brand and is one whole-card tap to
  `/r/:slug/b/:branchId/menu`. Empty sections collapse — no placeholder junk. Store badges
  render only when their URLs are set.
- **`/restaurants`** — the retained restaurant-card page (editorial grid of
  `RestaurantCard`s). Kept working for direct links; not linked from home.
- **Restaurant home (`/r/:slug`)** — the restaurant's own space: API-driven hero (name,
  tagline, hero image), branch cards ("Locations in …", not "towns served"), and clear order
  CTAs into `/r/:slug/b/:branchId/menu`. Availability is stated precisely and near the top.
- **Menu (`/r/:slug/b/:branchId/menu`)** — branch in the URL so refresh/share/history/"order
  again" always show the exact menu the user saw. Single-purpose viewports; sections vary
  rhythm and structure. No identical icon-card grids.

## Dark mode

Not in v1. Tokens are structured so a dark theme is one alternate block in `tokens.css`; the
food-photography strategy (white frame) is the reason light-first wins.
