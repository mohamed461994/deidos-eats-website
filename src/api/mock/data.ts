/**
 * MOCK DATA — placeholder Púca Pizza chain used when VITE_API_MODE=mock.
 * Shapes mirror the contract exactly (see src/api/types.ts) so swapping to the
 * live API changes no component code. Image URLs are Unsplash placeholders,
 * each verified to resolve; the real chain's photos come from the platform's
 * CloudFront bucket via the staff image-upload flow.
 */
import type { Branch, Menu, Restaurant } from '@/api/types'

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`

export const HERO_IMAGE = img('1574071318508-1cdbab80d002', 1800)
export const SHARING_IMAGE = img('1600628421055-4d30de868b8f', 1400)
export const TABLE_IMAGE = img('1548369937-47519962c11a', 1400)

export const RESTAURANT_ID = 'a1000000-0000-4000-8000-000000000001'
export const DUBLIN_BRANCH_ID = 'b1000000-0000-4000-8000-000000000001'
export const CORK_BRANCH_ID = 'b2000000-0000-4000-8000-000000000002'

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
  restaurantId: RESTAURANT_ID,
  name: 'Púca Ranelagh',
  description:
    'The original oven. Forty-eight-hour dough, San Marzano tomatoes, and a wood fire that never quite goes out.',
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
  restaurantId: RESTAURANT_ID,
  name: 'Púca Washington Street',
  description:
    'Same fire, southern charm. Late Fridays, split lunch shifts, and the best people-watching in Cork.',
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
    // Friday split shift — exercises multi-range rendering
    { weekday: 4, opensAt: '12:00', closesAt: '15:00' },
    { weekday: 4, opensAt: '17:00', closesAt: '23:30' },
  ],
}

export const restaurant: Restaurant = {
  id: RESTAURANT_ID,
  name: 'Púca Pizza',
  description:
    'Wood-fired pizza from Dublin and Cork. Named after the shape-shifting spirit of Irish folklore — mischief in the dough, fire in the oven.',
  branches: [dublinBranch, corkBranch].map((b) => ({
    id: b.id,
    name: b.name,
    town: b.address.town,
    imageUrl: b.imageUrl,
    isOpen: b.isOpen,
    fulfillment: b.fulfillment,
    payment: b.payment,
  })),
}

/* ---- Menu ------------------------------------------------------------- */

const VAT_FOOD = 1350 // hot takeaway food, 13.5%
const VAT_DRINKS = 2300 // soft drinks, 23%

const toppings = {
  id: 'mg100000-0000-4000-8000-000000000001',
  name: 'Extra toppings',
  minSelect: 0,
  maxSelect: 3,
  options: [
    { id: 'mo100000-0000-4000-8000-000000000001', name: 'Extra fior di latte', priceDeltaCents: 150, isAvailable: true },
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
        name: 'Wood-fired pizzas',
        sortOrder: 0,
        items: [
          {
            id: `i-puca-${branchId}`,
            name: 'The Púca',
            description:
              'Our margherita with the lights turned up — double fior di latte, San Marzano, hand-torn basil, cold-pressed olive oil.',
            priceCents: 1450,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1574071318508-1cdbab80d002'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings, dips],
          },
          {
            id: `i-margherita-${branchId}`,
            name: 'Margherita',
            description: 'San Marzano, fior di latte, basil. The one every oven is judged by.',
            priceCents: 1150,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1595854341625-f33ee10dbf94'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings, dips],
          },
          {
            id: `i-pepperoni-${branchId}`,
            name: 'Double Pepperoni',
            description: 'Cup-and-char pepperoni over stretched mozzarella. Ask for hot honey. Trust us.',
            priceCents: 1450,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1541745537411-b8046dc6d66c'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings, dips],
          },
          {
            id: `i-verdant-${branchId}`,
            name: 'The Verdant',
            description: 'White base, ricotta, wilted greens, lemon zest. Proof green can be greedy.',
            priceCents: 1350,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1593560708920-61dd98c46a4e'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings],
          },
          {
            id: `i-funghi-${branchId}`,
            name: 'Funghi & Thyme',
            description: 'Roast mushrooms, thyme, cherry tomatoes, aged parmesan.',
            priceCents: 1350,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1590947132387-155cc02f3212'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings, dips],
          },
          {
            id: `i-bbq-${branchId}`,
            name: 'Smoked BBQ Chicken',
            description: 'Smoked chicken, charred pineapple-free, red onion, coriander, bourbon BBQ swirl.',
            priceCents: 1550,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1565299624946-b28f40a0ae38'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings, dips],
          },
          {
            id: `i-garden-${branchId}`,
            name: 'Garden Party',
            description: 'Peppers, olives, sweetcorn, courgette — the allotment, blistered.',
            priceCents: 1250,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1552539618-7eec9b4d1796'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
            modifierGroups: [toppings, dips],
          },
          {
            id: `i-diavola-${branchId}`,
            name: 'Flatbread Diavola',
            description: 'Thin crackle base, chorizo, black olives, tomatoes, a lot of basil.',
            priceCents: 1395,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1585238342024-78d387f4a707'),
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
            id: `i-doughballs-${branchId}`,
            name: 'Wood-fired Dough Balls',
            description: 'Eight of them, garlic butter, charred edges. Gone in ninety seconds.',
            priceCents: 495,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: null,
            isAvailable: true,
            allergens: ['gluten', 'milk'],
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
            id: `i-panzanella-${branchId}`,
            name: 'Panzanella',
            description: 'Heritage tomatoes, torn mozzarella, basil, sourdough croutons from yesterday’s dough.',
            priceCents: 950,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1592417817098-8fd3d9eb14a5'),
            isAvailable: true,
            allergens: ['gluten', 'milk'],
          },
        ],
      },
      {
        id: `c4-${branchId}`,
        name: 'Desserts',
        sortOrder: 3,
        items: [
          {
            id: `i-tiramisu-${branchId}`,
            name: 'Tiramisu',
            description: 'Made each morning, dusted to order.',
            priceCents: 650,
            vatRateBasisPoints: VAT_FOOD,
            imageUrl: img('1571877227200-a0d98ea607e9'),
            isAvailable: true,
            allergens: ['gluten', 'milk', 'eggs'],
          },
          {
            id: `i-brownie-${branchId}`,
            name: 'Oven-corner Brownie',
            description: 'Baked in the cool corner of the pizza oven. Vanilla ice cream, caramel.',
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
            id: `i-elderflower-${branchId}`,
            name: 'Sparkling Elderflower',
            description: 'Irish elderflower, lightly sparkling.',
            priceCents: 340,
            vatRateBasisPoints: VAT_DRINKS,
            imageUrl: null,
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
}

export const branches: Record<string, Branch> = {
  [DUBLIN_BRANCH_ID]: dublinBranch,
  [CORK_BRANCH_ID]: corkBranch,
}
