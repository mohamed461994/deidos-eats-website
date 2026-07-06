# Design

Visual system for the Deidos Eats customer website (placeholder brand: **Púca Pizza**).
Seed doc — written pre-implementation; refresh with `/impeccable document` once real
components exist. All values below are the single source of truth and live in
`src/theme/tokens.css`; components consume semantic tokens only.

## Mood

**Wood-fired basil** — charred crust, fresh basil dropped on molten mozzarella, a chalk
menu in a Dublin laneway. Warm neighborhood joint expressed with modern confidence.
Appetite-forward: photography carries the heat; the UI is the cool counterpoint that
frames it.

## Color

Strategy: **Committed** on brand surfaces (basil green carries hero, nav accents, CTAs —
30–60% of the home surface), **Restrained** on task surfaces (checkout, tracking, account:
white + ink + green for primary actions only). Pure white background — warmth lives in the
brand colors, photography, and type, never in a beige wash (explicit anti-reference).

| Token | OKLCH | Role |
|---|---|---|
| `--color-bg` | `oklch(1 0 0)` | Page background. Pure white, no hidden warmth. |
| `--color-surface` | `oklch(0.956 0.004 140)` | Cards, panels, wells — bg pulled slightly toward ink. |
| `--color-ink` | `oklch(0.24 0.02 140)` | Body text. ≥7:1 on bg. Carries a whisper of the brand hue. |
| `--color-muted` | `oklch(0.47 0.02 140)` | Secondary text. ≥4.5:1 on bg. |
| `--color-primary` | `oklch(0.40 0.13 143)` | **Basil** — deep wood-fired green. CTAs, links, nav, brand fills. White text on fills. |
| `--color-primary-deep` | `oklch(0.30 0.10 143)` | Basil pressed/hover; drenched brand sections. |
| `--color-accent` | `oklch(0.62 0.19 38)` | **Ember** — wood-fire heat. Appetite highlights, "popular" tags, live-status pulse. White text on fills. |
| `--color-crust` | `oklch(0.87 0.06 85)` | Baked gold. Subtle tints, rating stars, dividers on green. |
| `--color-paper-on-deep` | `oklch(0.97 0.01 110)` | Text/surfaces sitting on `primary-deep` drench sections. |

Semantic states: `--color-success` = primary basil family; `--color-error`
`oklch(0.55 0.19 25)`; `--color-warning` `oklch(0.70 0.15 70)`; `--color-info` = ink at
70%. Focus ring: `--color-accent` 2px offset 2px — visible on both white and green.

Rules: white text on all saturated mid-luminance fills (basil, ember). No gradient text,
no side-stripe accents, no beige body backgrounds. Green-on-cream is a named AI attractor
zone — the drench direction here is **paper-on-deep-basil**, never basil-on-cream.

## Typography

Single family, committed contrast: **Bricolage Grotesque Variable** (optical size axis
12–96, weights 200–800, via `@fontsource-variable/bricolage-grotesque`). Warm, chunky,
slightly irregular grotesque — a hand-painted pizzeria fascia, not a startup deck.
Fallback stack: `system-ui, 'Segoe UI', sans-serif`.

- **Display** (home hero, section heads): opsz high, weight 700–800, tight leading
  (1.02–1.1), letter-spacing −0.02em (floor −0.04em). Fluid: hero
  `clamp(2.75rem, 8vw, 5.5rem)`; section `clamp(2rem, 4.5vw, 3.25rem)`. `text-wrap: balance`.
- **UI/body** (menu, checkout, account): fixed rem scale, ratio ~1.2 —
  13 / 15 / 16 / 19 / 23 / 28px. Weight 400 body, 550 labels, 650 headings. Line-height 1.5
  body, 1.3 dense UI. Prices and order numbers: `font-variant-numeric: tabular-nums`.
- Menu item names get display warmth (weight 650, opsz mid); descriptions stay quiet
  (15px, muted).

## Spacing, shape, elevation

- Spacing: 4px base scale (4/8/12/16/24/32/48/64/96). Brand sections breathe with
  `clamp(4rem, 10vw, 8rem)` vertical rhythm; task screens run compact (16/24).
- Radius: hand-built generosity — `--radius-sm` 10px (inputs, tags), `--radius-md` 16px
  (cards, sheets), `--radius-full` pills (CTAs, filters). Photography corners 16px.
- Elevation: shadows are soft and warm-neutral, two levels only (raised
  `0 1px 2px / 6%`, floating `0 8px 30px / 12%`). No glassmorphism.
- Z-scale: `dropdown(10) < sticky(20) < backdrop(30) < sheet/modal(40) < toast(50) < tooltip(60)`.

## Imagery

Food photography is the hero and is non-negotiable: overhead and 45° shots, dark charred
crusts, real steam and mess, warm side-light — never sterile catalog shots. Hero and menu
photos ship as real images (Unsplash placeholders until brand photography exists; URLs
verified before shipping). Alt text carries the voice ("Nduja and honey, blistered crust")
— never "pizza image". `aspect-ratio` boxes + `object-fit: cover`; LQIP background tint
(`--color-surface`) while loading.

## Motion

Purposeful, warm, quick. Easing `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint
family) everywhere; durations 150–250ms in task flows, up to 600ms for the single
orchestrated home-hero reveal. Signature moves:

- **Home hero**: one page-load choreography (headline rise + photo scale-settle). Content
  visible by default; motion enhances, never gates.
- **Add-to-cart**: item photo arcs toward the cart pill; cart count bumps. This is the
  product's one indulgence — it confirms state.
- **Order tracking**: status steps advance with a draw-line + ember pulse on the active
  step. Live region announces changes.
- Sheets/drawers slide with transform only; list items never stagger more than 40ms apart.

`prefers-reduced-motion`: all of the above become crossfades or instant state changes.
No parallax, no bounce, no scroll-jacking.

## Components

shadcn/ui (Radix) primitives restyled through tokens — same stack as the dashboard.
Core vocabulary: pill Button (primary basil / ghost / destructive), Sheet (cart on mobile),
Dialog (item detail on desktop, full-screen sheet on mobile), Tabs (menu categories,
sticky under header), Badge (ember "Popular", crust "New"), Stepper (order tracking),
Skeleton loaders (photo-shaped, never spinners mid-content), Toast (bottom, above cart bar).
Every interactive component ships default / hover / focus-visible / active / disabled /
loading / error states. Empty states teach ("Your cart is empty — the ovens are ready").

## Layout

Mobile-first, one-thumb reach: persistent bottom cart bar on mobile (sticky, safe-area
aware), max content width 1200px desktop, menu grid `repeat(auto-fit, minmax(280px, 1fr))`.
Home is single-purpose viewports: hero → menu highlights → how-it-works (ordering promise)
→ locations → footer. No identical icon-card grids; sections vary rhythm and structure.

## Dark mode

Not in v1. Tokens are structured so a dark theme is one alternate block in `tokens.css`;
food photography strategy (white frame) is the reason light-first wins.
