# Product

## Register

brand

> The home / menu-browse surfaces are brand register (design IS the product — appetite and
> trust are built here). Checkout, order tracking, and account flows switch to product
> register: familiar, fast, state-rich, zero decoration in the way of the task.

## Users

Hungry customers of one Irish restaurant chain (placeholder brand: **Púca Pizza**, branches
in Dublin & Cork), ordering on their phones — on the couch, on a lunch break, walking home.
Mobile-first is not a nicety; most orders happen on a phone with one thumb. They want to see
the food, pick a branch, order in under two minutes, and know exactly when it'll be ready.
Secondary: desktop users browsing the menu or checking locations/hours.

## Product Purpose

The chain's public website and web ordering channel, built on the Deidos Eats platform
(existing AWS serverless API). It does three jobs, in order: **order** (browse menu → cart →
checkout → live order tracking), **menu** (appetite-forward browsing that sells the food),
and **locations** (branches, hours, collection/delivery info). Success = a first-time
visitor completes an order without friction and comes back without thinking about it.

## Brand Personality

Warm neighborhood joint, high craft. Three words: **warm, hand-built, appetite-forward**.
The trusted wood-fired spot on your street in Dublin — flour-dusted counter, chalk menu,
charred crust — expressed with modern confidence, not rustic kitsch. The food photography
is the hero; the interface frames it and gets out of the way. Voice: friendly, direct,
a little playful (the púca is a shape-shifting Irish spirit — mischief, not menace).

**Casual premium**: premium craft signals (committed color, confident display type,
purposeful motion) at neighborhood prices. Never stiff, never shouty.

*The brand is a placeholder.* Like the dashboard and iOS app, every color / font / radius
lives in swappable semantic tokens (see DESIGN.md) so a real chain identity can be dropped
in later without touching component code.

## Anti-references

- **Generic AI landing page** — cream background, eyebrow kickers over every section,
  identical icon-card grids, gradient text, Inter-by-default.
- **Corporate fast-food promo clutter** — McDonald's/Supermac's banner noise, app-install
  popups, badge soup, countdown urgency.
- **Dark moody fine-dining** — black backgrounds, italic serif elegance, reservation-first
  vibes. Wrong register for a casual chain.
- **Aggregator sameness** — Just Eat / Deliveroo listing-grid anonymity. This is one
  chain's own home, not a marketplace.

## Design Principles

1. **The food is the interface.** Photography leads every appetite decision; UI chrome
   frames it. A menu item is sold by its photo and name, not by a card border.
2. **Two minutes to ordered.** Every screen between hunger and confirmation earns its
   place. Persistent cart, one-thumb reach, no dead ends, no forced signup before browsing.
3. **Show state honestly.** Orders move through a real kitchen lifecycle — surface it
   truthfully (live status, realistic times, clear cancellation rules). Loading, empty,
   and error states are designed, never default.
4. **Warmth through craft, not tint.** The neighborhood feel comes from type, color
   commitment, photography, and copy — not from a beige wash over everything.
5. **Tokens over taste.** All visual identity flows through semantic tokens; components
   never hard-code brand values. The placeholder brand must be swappable in one file.

## Accessibility & Inclusion

WCAG 2.2 AA: ≥4.5:1 body text contrast (≥3:1 large text), full keyboard operability,
visible focus, 44px touch targets on interactive elements, `prefers-reduced-motion`
alternatives for all animation, semantic landmarks and form labels, and status updates
announced via live regions (order tracking). Menus and prices must be real text, never
text-in-images.
