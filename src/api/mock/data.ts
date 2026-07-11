/**
 * MOCK DATA — a small TWO-restaurant marketplace used when VITE_API_MODE=mock
 * (the vitest harness only; the running site always uses the live API). Shapes
 * mirror the contract exactly (see src/api/types.ts) so swapping to the live API
 * changes no component code.
 *
 * Restaurant A (Deidos Grill) keeps the original branch ids, menu, and prices so
 * the existing flow/identity tests stay valid; Restaurant B (Nonna's Table) adds
 * a second restaurant in a different county for the N=2 marketplace tests. Two
 * more restaurants (coming-soon, paused) are reachable BY SLUG only — they drive
 * the unavailable-state tests without changing the two-card discovery list.
 */
import type { Branch, BranchSummary, Menu, Restaurant } from '@/api/types'

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`

// Restaurant A — retains the original ids so flow.test / identity.test hold.
export const RESTAURANT_ID = 'a1000000-0000-4000-8000-000000000001'
export const RESTAURANT_A_ID = RESTAURANT_ID
export const DUBLIN_BRANCH_ID = 'b1000000-0000-4000-8000-000000000001'
export const CORK_BRANCH_ID = 'b2000000-0000-4000-8000-000000000002'

// Restaurant B — a second restaurant in a different county (marketplace tests).
export const RESTAURANT_B_ID = 'a2000000-0000-4000-8000-000000000002'
export const GALWAY_BRANCH_ID = 'b3000000-0000-4000-8000-000000000003'

const FULL_WEEK_HOURS = [
  { weekday: 0, opensAt: '12:00', closesAt: '22:00' },
  { weekday: 1, opensAt: '12:00', closesAt: '22:00' },
  { weekday: 2, opensAt: '12:00', closesAt: '22:00' },
  { weekday: 3, opensAt: '12:00', closesAt: '22:00' },
  { weekday: 4, opensAt: '12:00', closesAt: '23:00' },
  { weekday: 5, opensAt: '12:00', closesAt: '23:00' },
  { weekday: 6, opensAt: '13:00', closesAt: '21:30' },
]

export const dublinBranch: Branch = {
  id: DUBLIN_BRANCH_ID,
  restaurantId: RESTAURANT_A_ID,
  name: 'Ranelagh',
  description:
    'The original grill. Charcoal-fired, dry-aged, and a fire that never quite goes out.',
  imageUrl: img('1513104890138-7c749659a591', 1400),
  address: {
    line1: '44 Ranelagh Road',
    line2: null,
    town: 'Ranelagh, Dublin 6',
    county: 'Dublin',
    eircode: 'D06 F2P8',
    latitude: 53.3267,
    longitude: -6.2523,
  },
  timezone: 'Europe/Dublin',
  isOpen: true,
  fulfillment: {
    collectionEnabled: true,
    deliveryEnabled: true,
    deliveryFeeCents: 290,
    minOrderCents: 1500,
    deliveryRadiusKm: 5,
    deliveryBaseRadiusKm: 2,
    deliveryPerKmCents: 80,
  },
  payment: { cashEnabled: false },
  pos: {} as Branch['pos'],
  openingHours: FULL_WEEK_HOURS,
}

export const corkBranch: Branch = {
  id: CORK_BRANCH_ID,
  restaurantId: RESTAURANT_A_ID,
  name: 'Washington Street',
  description: 'Same fire, southern charm. Late Fridays and the best people-watching in Cork.',
  imageUrl: img('1590947132387-155cc02f3212', 1400),
  address: {
    line1: '21 Washington Street West',
    line2: null,
    town: 'Cork',
    county: 'Cork',
    eircode: 'T12 X2FP',
    latitude: 51.8969,
    longitude: -8.4863,
  },
  timezone: 'Europe/Dublin',
  isOpen: true,
  fulfillment: {
    collectionEnabled: true,
    deliveryEnabled: true,
    deliveryFeeCents: 250,
    minOrderCents: 1200,
    deliveryRadiusKm: 4,
    deliveryBaseRadiusKm: 2,
    deliveryPerKmCents: 70,
  },
  payment: { cashEnabled: true },
  pos: {} as Branch['pos'],
  openingHours: [
    ...FULL_WEEK_HOURS.filter((h) => h.weekday !== 4),
    { weekday: 4, opensAt: '12:00', closesAt: '15:00' },
    { weekday: 4, opensAt: '17:00', closesAt: '23:30' },
  ],
}

export const galwayBranch: Branch = {
  id: GALWAY_BRANCH_ID,
  restaurantId: RESTAURANT_B_ID,
  name: 'Quay Street',
  description: 'A tiny room, a big pot, and Nonna’s ragù on since dawn.',
  imageUrl: img('1481931098730-318b6f776db0', 1400),
  address: {
    line1: '3 Quay Street',
    line2: null,
    town: 'Galway',
    county: 'Galway',
    eircode: 'H91 XY24',
    latitude: 53.2707,
    longitude: -9.0568,
  },
  timezone: 'Europe/Dublin',
  isOpen: true,
  fulfillment: {
    collectionEnabled: true,
    deliveryEnabled: true,
    deliveryFeeCents: 300,
    minOrderCents: 1500,
    deliveryRadiusKm: 4,
    deliveryBaseRadiusKm: 2,
    deliveryPerKmCents: 75,
  },
  payment: { cashEnabled: true },
  pos: {} as Branch['pos'],
  openingHours: FULL_WEEK_HOURS,
}

function toSummary(branch: Branch): BranchSummary {
  return {
    id: branch.id,
    name: branch.name,
    town: branch.address.town,
    imageUrl: branch.imageUrl,
    isOpen: branch.isOpen,
    fulfillment: branch.fulfillment,
    payment: branch.payment,
  }
}

export const restaurantA: Restaurant = {
  id: RESTAURANT_A_ID,
  slug: 'deidos-grill',
  name: 'Deidos Grill',
  description:
    'Charcoal-fired steaks and burgers from Dublin and Cork. Dry-aged, hand-ground, blistered over open flame.',
  tagline: 'Charcoal-fired, dry-aged, dangerously good.',
  logoUrl: null,
  heroImageUrl: img('1544025162-d76694265947', 1800),
  heroImageAlt: 'A charred dry-aged steak resting on a wooden board',
  marketplaceStatus: 'acceptingOrders',
  branches: [dublinBranch, corkBranch].map(toSummary),
}

export const restaurantB: Restaurant = {
  id: RESTAURANT_B_ID,
  slug: 'nonnas-table',
  name: "Nonna's Table",
  description:
    'Slow Italian cooking from a tiny Galway kitchen. Fresh pasta, all-day ragù, and the best tiramisu on the west coast.',
  tagline: 'Fresh pasta and all-day ragù from Galway.',
  logoUrl: null,
  heroImageUrl: img('1621996346565-e3dbc646d9a9', 1800),
  heroImageAlt: 'A bowl of hand-rolled pasta with slow-cooked ragù',
  marketplaceStatus: 'acceptingOrders',
  branches: [galwayBranch].map(toSummary),
}

// Reachable by slug only (not in the discovery list) — unavailable-state tests.
export const restaurantComingSoon: Restaurant = {
  id: 'a3000000-0000-4000-8000-000000000003',
  slug: 'sea-salt',
  name: 'Sea Salt',
  description: 'Coastal seafood, landing soon.',
  tagline: 'Coastal seafood, landing soon.',
  logoUrl: null,
  heroImageUrl: null,
  heroImageAlt: null,
  marketplaceStatus: 'comingSoon',
  branches: [],
}

export const restaurantPaused: Restaurant = {
  id: 'a4000000-0000-4000-8000-000000000004',
  slug: 'the-dock',
  name: 'The Dock',
  description: 'Harbourside plates.',
  tagline: 'Harbourside plates.',
  logoUrl: null,
  heroImageUrl: null,
  heroImageAlt: null,
  marketplaceStatus: 'paused',
  branches: [toSummary({ ...galwayBranch, id: 'b4000000-0000-4000-8000-000000000004', restaurantId: 'a4000000-0000-4000-8000-000000000004', name: 'Harbour Road' })],
}

/** The discovery feed — exactly the two orderable restaurants (N=2). */
export const restaurantList: Restaurant[] = [restaurantA, restaurantB]

/** Every restaurant reachable by id / slug (includes the by-slug-only ones). */
export const allRestaurants: Restaurant[] = [
  restaurantA,
  restaurantB,
  restaurantComingSoon,
  restaurantPaused,
]

/* ---- Menu ------------------------------------------------------------- */

const VAT_FOOD = 1350 // hot takeaway food (VAT reclassification is a later step)
const VAT_DRINKS = 2300 // soft drinks, 23%

const toppings = {
  id: 'mg100000-0000-4000-8000-000000000001',
  name: 'Extra toppings',
  minSelect: 0,
  maxSelect: 3,
  options: [
    { id: 'mo100000-0000-4000-8000-000000000001', name: 'Extra cheese', priceDeltaCents: 150, isAvailable: true },
    { id: 'mo100000-0000-4000-8000-000000000002', name: 'Nduja', priceDeltaCents: 200, isAvailable: true },
    { id: 'mo100000-0000-4000-8000-000000000003', name: 'Portobello mushrooms', priceDeltaCents: 100, isAvailable: true },
    { id: 'mo100000-0000-4000-8000-000000000004', name: 'Red onion', priceDeltaCents: 75, isAvailable: true },
    { id: 'mo100000-0000-4000-8000-000000000005', name: 'Jalapeños', priceDeltaCents: 100, isAvailable: true },
  ],
}

const dips = {
  id: 'mg200000-0000-4000-8000-000000000002',
  name: 'Dips',
  minSelect: 0,
  maxSelect: 2,
  options: [
    { id: 'mo200000-0000-4000-8000-000000000001', name: 'Garlic aioli', priceDeltaCents: 50, isAvailable: true },
    { id: 'mo200000-0000-4000-8000-000000000002', name: 'Hot honey', priceDeltaCents: 75, isAvailable: true },
    { id: 'mo200000-0000-4000-8000-000000000003', name: 'Basil pesto', priceDeltaCents: 75, isAvailable: false },
  ],
}

function menuFor(branchId: string): Menu {
  return {
    branchId,
    categories: [
      {
        id: `c1-${branchId}`,
        name: 'From the grill',
        sortOrder: 0,
        items: [
          {
            id: `i-house-${branchId}`,
            name: 'The House Special',
            description:
              'Dry-aged patty, aged cheddar, house pickles, smoked mayo, in a toasted brioche bun.',
            priceCents: 1450,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1568901346375-23c9450c58cd'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings, dips],
          },
          {
            id: `i-classic-${branchId}`,
            name: 'The Classic',
            description: 'Single patty, lettuce, tomato, red onion. The one every grill is judged by.',
            priceCents: 1150,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1565299624946-b28f40a0ae38'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings, dips],
          },
          {
            id: `i-double-${branchId}`,
            name: 'Double Stack',
            description: 'Two patties, double cheese, smoked bacon. Ask for hot honey. Trust us.',
            priceCents: 1450,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1550547660-d9450f859349'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings, dips],
          },
          {
            id: `i-buttermilk-${branchId}`,
            name: 'Buttermilk Chicken',
            description: 'Buttermilk-brined thigh, slaw, pickles, chipotle mayo.',
            priceCents: 1350,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1606755962773-d324e0a13086'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings],
          },
          {
            id: `i-garden-${branchId}`,
            name: 'Garden Stack',
            description: 'Charred halloumi, roast pepper, harissa, rocket. The greens, blistered.',
            priceCents: 1250,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1552539618-7eec9b4d1796'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings, dips],
          },
          {
            id: `i-special-${branchId}`,
            name: 'Off-menu Smash',
            description: 'Thin, crisp-edged double smash — Dublin only, while it lasts.',
            priceCents: 1395,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1586190848861-99aa4a171e90'),
            isAvailable: branchId === DUBLIN_BRANCH_ID,
            allergens: ['gluten', 'milk', 'sulphites'],
            modifierGroups: [dips],
          },
        ],
      },
      {
        id: `c2-${branchId}`,
        name: 'Sides',
        sortOrder: 1,
        items: [
          {
            id: `i-fries-${branchId}`,
            name: 'Parmesan & Rosemary Fries',
            description: 'Twice-cooked, snowed with parmesan, rosemary salt.',
            priceCents: 595,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1573080496219-bb080dd4f877'),
            isAvailable: true,
            allergens: ['milk'],
            modifierGroups: [dips],
          },
          {
            id: `i-rings-${branchId}`,
            name: 'Beer-battered Onion Rings',
            description: 'Six of them, crisp, gone in ninety seconds.',
            priceCents: 495,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: null,
            isAvailable: true,
            allergens: ['gluten'],
            modifierGroups: [dips],
          },
        ],
      },
      {
        id: `c3-${branchId}`,
        name: 'Salads',
        sortOrder: 2,
        items: [
          {
            id: `i-caesar-${branchId}`,
            name: 'Grilled Chicken Caesar',
            description: 'Baby gem, aged parmesan, sourdough croutons, anchovy dressing.',
            priceCents: 950,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1550304943-4f24f54ddde9'),
            isAvailable: true,
            allergens: ['gluten', 'milk', 'fish'],
          },
        ],
      },
      {
        id: `c4-${branchId}`,
        name: 'Desserts',
        sortOrder: 3,
        items: [
          {
            id: `i-brownie-${branchId}`,
            name: 'Salted Caramel Brownie',
            description: 'Warm, fudgy, vanilla ice cream, salted caramel.',
            priceCents: 595,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1551024506-0bccd828d307'),
            isAvailable: true,
            allergens: ['gluten', 'milk', 'eggs', 'nuts'],
          },
        ],
      },
      {
        id: `c5-${branchId}`,
        name: 'Drinks',
        sortOrder: 4,
        items: [
          {
            id: `i-cola-${branchId}`,
            name: 'Cola with Lime',
            description: 'Glass bottle, plenty of ice, fresh lime.',
            priceCents: 320,
            vatRateBasisPoints: VAT_DRINKS,
            imageUrl: img('1581636625402-29b2a704ef13'),
            isAvailable: true,
            allergens: [],
          },
          {
            id: `i-water-${branchId}`,
            name: 'Still Water',
            description: '500ml, chilled.',
            priceCents: 250,
            vatRateBasisPoints: VAT_DRINKS,
            imageUrl: null,
            isAvailable: true,
            allergens: [],
          },
        ],
      },
    ],
  }
}

export const menus: Record<string, Menu> = {
  [DUBLIN_BRANCH_ID]: menuFor(DUBLIN_BRANCH_ID),
  [CORK_BRANCH_ID]: menuFor(CORK_BRANCH_ID),
  [GALWAY_BRANCH_ID]: menuFor(GALWAY_BRANCH_ID),
}

export const branches: Record<string, Branch> = {
  [DUBLIN_BRANCH_ID]: dublinBranch,
  [CORK_BRANCH_ID]: corkBranch,
  [GALWAY_BRANCH_ID]: galwayBranch,
}

/** Which restaurant a branch belongs to — for order snapshots at checkout. */
export function restaurantForBranch(branchId: string): Restaurant | undefined {
  const branch = branches[branchId]
  if (!branch) return undefined
  return allRestaurants.find((r) => r.id === branch.restaurantId)
}
