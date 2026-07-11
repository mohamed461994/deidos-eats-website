# Product

## Register

brand + platform

> Two registers, cleanly split. **Discovery and each restaurant's home / menu-browse**
> surfaces are brand register (design IS the product — appetite and trust are built here),
> but the brand shown is the *restaurant's*, delivered by the API. **Checkout, order
> tracking, and account** flows switch to product register: familiar, fast, state-rich,
> zero decoration in the way of the task. The **platform chrome** around all of it (header,
> footer, 404, auth) is a third, quiet register: Deidos Eats frames, it never competes with
> the restaurant it's framing.

## Users

Hungry people in Ireland ordering from restaurants on the **Deidos Eats** marketplace — on
the couch, on a lunch break, walking home. The marketplace launches with **two
hand-onboarded restaurants** and is built to add more without a redesign. Users want to see
the food, pick a restaurant and a branch, order in under two minutes, and know exactly when
it'll be ready. Mobile-first is not a nicety; most orders happen on a phone with one thumb.
Secondary: desktop users browsing a restaurant's menu or checking its locations/hours.

At N=2 there is **no search, no ratings, no cuisine filters** — discovery is a short,
curated choice, not an infinite feed. The information architecture leaves headroom for those
later without shipping dead marketplace chrome now.

## Product Purpose

The public buyer surface of the Deidos Eats platform (existing AWS serverless API). It does
four jobs, in order: **discover** (choose a restaurant), **browse** (appetite-forward menu
that sells the food, per restaurant + branch), **order** (branch → cart → checkout → live
tracking), and **locate** (a restaurant's branches, hours, collection/delivery info).
Success = a first-time visitor picks a restaurant, completes an order without friction, and
comes back without thinking about it.

**One checkout = one branch = one order** is structurally enforced by the platform. A cart
therefore belongs to exactly **one restaurant and one branch**; switching either is an
explicit, confirmed action that starts the basket fresh.

## Brand model — two levels

1. **Platform brand — Deidos Eats.** The chrome: header wordmark, footer, 404, auth pages,
   document/SEO metadata. Calm, trustworthy, gets out of the way. It is the *shelf*, not the
   product on it.
2. **Restaurant brand — API-driven.** Everything inside `/r/:slug` presents the restaurant's
   own identity: name, tagline, logo, hero image (all from the `Restaurant` contract). The
   restaurant sells; the platform hosts. There is **one platform visual theme** today
   (per-restaurant theming — accent colours etc. — is deferred to a later phase); the
   restaurant's *content and imagery* carry its personality within that theme.

*Both brands are still placeholders.* The dev dataset seeds real restaurants (e.g. Deidos
Grill); the platform identity ("Deidos Eats") is a working name. As with the dashboard and
iOS app, every colour / font / radius lives in swappable semantic tokens (see DESIGN.md) so a
real platform identity — and, later, per-restaurant accents — can be dropped in without
touching component code.

## Personality

- **Platform (Deidos Eats):** quiet confidence, competent, warm-but-neutral. Never louder
  than the restaurant. Think a well-run indoor market hall, not a billboard.
- **Restaurant:** whatever the restaurant's own brand is — carried by its copy, menu, and
  photography, framed consistently by the platform.

## Anti-references

- **Generic AI landing page** — cream background, eyebrow kickers over every section,
  identical icon-card grids, gradient text, Inter-by-default.
- **Corporate fast-food promo clutter** — banner noise, app-install popups, badge soup,
  countdown urgency.
- **Dark moody fine-dining** — black backgrounds, italic serif elegance, reservation-first
  vibes. Wrong register for casual ordering.
- **Aggregator anonymity** — Just Eat / Deliveroo listing-grid sameness where every
  restaurant is flattened into an identical card in an endless scroll and no restaurant has a
  home of its own. Deidos Eats is a marketplace, but the opposite of anonymous: **each
  restaurant gets a real home** (`/r/:slug`) that presents *its* brand, and discovery at N=2
  is a curated, editorial choice — two considered feature cards, not a sparse grid pretending
  to be infinite. The platform is the frame; it must never overpower the restaurant inside
  it, and it must never reduce a restaurant to a faceless row.

## Design Principles

1. **The food is the interface.** Photography leads every appetite decision; UI chrome
   frames it. A menu item is sold by its photo and name, not by a card border.
2. **Two levels, never blurred.** Platform chrome stays quiet and consistent; restaurant
   brand lives inside `/r/:slug` and is API-driven. On global routes (checkout, orders,
   account) restaurant identity is derived from the **cart/order**, never from "the last
   restaurant browsed."
3. **Two minutes to ordered.** Every screen between hunger and confirmation earns its place.
   Persistent cart, one-thumb reach, no dead ends, no forced signup before browsing.
4. **One cart, one restaurant, one branch — honestly.** The cart always names its restaurant.
   Adding from a different restaurant or branch is a confirmed, destructive choice with
   explicit named buttons; cancelling leaves the original basket untouched.
5. **Show state honestly.** Restaurants and branches have real availability
   (coming-soon / paused / closed / no-branches) and orders move through a real kitchen
   lifecycle. Surface all of it truthfully. Loading, empty, unavailable, and error states are
   designed, never default.
6. **Marketplace-shaped, not aggregator-shaped.** Build for restaurants #3+ slotting in
   without a redesign — reusable `RestaurantCard`, slug-based routing — while refusing dead
   chrome (no empty search bar, no fake infinite grid) until the feature that needs it ships.
7. **Tokens over taste.** All visual identity flows through semantic tokens; components never
   hard-code brand values. One platform theme today, swappable in one file.

## Accessibility & Inclusion

WCAG 2.2 AA: ≥4.5:1 body text contrast (≥3:1 large text), full keyboard operability, visible
focus, 44px touch targets on interactive elements, `prefers-reduced-motion` alternatives for
all animation, semantic landmarks and form labels, route-change focus/announcement on SPA
navigation, and status updates announced via live regions (order tracking). Menus and prices
must be real text, never text-in-images. (Deep a11y/image audit is a launch-batch step, not
part of the marketplace core.)
