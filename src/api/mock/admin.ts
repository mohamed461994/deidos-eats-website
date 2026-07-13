import type {
  MenuCatalogItem,
  MenuCatalogPage,
  MenuItem,
  MenuItemUpdate,
  PromoState,
} from '@/api/types'

import { ApiError } from '../errors'
import { menus, mockMarketplace } from './data'

interface RawPromoState {
  priceCents: number | null
  startsAt: string | null
  endsAt: string | null
  updatedAt: string
}

let rawPromos = new Map<string, RawPromoState>()
let updateSequence = 0

function timestamp(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

function menuEntries(branchId: string) {
  return (menus[branchId]?.categories ?? []).flatMap((category) =>
    category.items.map((item) => ({ category, item })),
  )
}

function initialRawPromos(): Map<string, RawPromoState> {
  const next = new Map<string, RawPromoState>()
  for (const menu of Object.values(menus)) {
    for (const category of menu.categories) {
      for (const item of category.items) {
        const promo = mockMarketplace.promos[item.id]
        next.set(item.id, {
          priceCents: promo?.promoPriceCents ?? null,
          startsAt: null,
          endsAt: promo?.endsAtMs ? new Date(promo.endsAtMs).toISOString() : null,
          updatedAt: timestamp(-60_000),
        })
      }
    }
  }

  // Keep one scheduled and one expired raw promo in the manager catalog. They
  // deliberately remain absent from the public active-only menu projection.
  const fixtures = menuEntries(Object.keys(menus)[0] ?? '')
  const scheduled = fixtures.find(({ item }) => !mockMarketplace.promos[item.id])
  const expired = fixtures.find(
    ({ item }) => !mockMarketplace.promos[item.id] && item.id !== scheduled?.item.id,
  )
  if (scheduled) {
    next.set(scheduled.item.id, {
      priceCents: Math.max(1, scheduled.item.priceCents - 200),
      startsAt: timestamp(24 * 60 * 60 * 1000),
      endsAt: timestamp(7 * 24 * 60 * 60 * 1000),
      updatedAt: timestamp(-50_000),
    })
  }
  if (expired) {
    next.set(expired.item.id, {
      priceCents: Math.max(1, expired.item.priceCents - 150),
      startsAt: timestamp(-7 * 24 * 60 * 60 * 1000),
      endsAt: timestamp(-24 * 60 * 60 * 1000),
      updatedAt: timestamp(-40_000),
    })
  }
  return next
}

function promoState(raw: RawPromoState, now = Date.now()): PromoState {
  if (raw.priceCents === null) return 'none'
  if (raw.startsAt && now < Date.parse(raw.startsAt)) return 'scheduled'
  if (raw.endsAt && now >= Date.parse(raw.endsAt)) return 'expired'
  return 'active'
}

function catalogItem(
  item: MenuItem,
  categoryId: string,
  categoryName: string,
): MenuCatalogItem {
  const raw = rawPromos.get(item.id) ?? {
    priceCents: null,
    startsAt: null,
    endsAt: null,
    updatedAt: timestamp(-60_000),
  }
  return {
    ...item,
    categoryId,
    categoryName,
    onlinePromoPriceCents: raw.priceCents,
    onlinePromoStartsAt: raw.startsAt,
    onlinePromoEndsAt: raw.endsAt,
    promoState: promoState(raw),
    updatedAt: raw.updatedAt,
  }
}

function findItem(itemId: string) {
  for (const [branchId, menu] of Object.entries(menus)) {
    for (const category of menu.categories) {
      const item = category.items.find((candidate) => candidate.id === itemId)
      if (item) return { branchId, category, item }
    }
  }
  return null
}

function syncPublicPromo(itemId: string, raw: RawPromoState) {
  delete mockMarketplace.promos[itemId]
  if (promoState(raw) !== 'active' || raw.priceCents === null) return
  mockMarketplace.promos[itemId] = {
    promoPriceCents: raw.priceCents,
    endsAtMs: raw.endsAt ? Date.parse(raw.endsAt) : null,
  }
}

export function resetMockAdminForTests() {
  updateSequence = 0
  rawPromos = initialRawPromos()
}

export function listMockMenuCatalog(branchId: string): MenuCatalogPage {
  if (!menus[branchId]) {
    throw new ApiError(404, { code: 'not_found', message: 'Branch not found.' })
  }
  return {
    branchId,
    items: menuEntries(branchId).map(({ category, item }) =>
      catalogItem(item, category.id, category.name),
    ),
    pageInfo: { nextCursor: null },
  }
}

export function updateMockPromo(itemId: string, update: MenuItemUpdate): MenuCatalogItem {
  const found = findItem(itemId)
  if (!found) throw new ApiError(404, { code: 'not_found', message: 'Item not found.' })
  const current = rawPromos.get(itemId)!
  if (update.expectedUpdatedAt !== current.updatedAt) {
    throw new ApiError(409, {
      code: 'conflict',
      message: 'This item changed since it was loaded.',
    })
  }

  const next: RawPromoState =
    update.onlinePromoPriceCents === null
      ? {
          priceCents: null,
          startsAt: null,
          endsAt: null,
          updatedAt: current.updatedAt,
        }
      : {
          priceCents: update.onlinePromoPriceCents ?? current.priceCents,
          startsAt:
            update.onlinePromoStartsAt === undefined
              ? current.startsAt
              : update.onlinePromoStartsAt,
          endsAt:
            update.onlinePromoEndsAt === undefined ? current.endsAt : update.onlinePromoEndsAt,
          updatedAt: current.updatedAt,
        }

  if (
    next.priceCents === null ||
    next.priceCents < 1 ||
    next.priceCents >= found.item.priceCents
  ) {
    if (update.onlinePromoPriceCents !== null) {
      throw new ApiError(422, {
        code: 'validation_failed',
        message: 'Promo price must be below the base price.',
      })
    }
  }
  if (next.startsAt && next.endsAt && Date.parse(next.startsAt) >= Date.parse(next.endsAt)) {
    throw new ApiError(422, {
      code: 'validation_failed',
      message: 'Promo start must be before its end.',
    })
  }

  next.updatedAt = timestamp(++updateSequence)
  rawPromos.set(itemId, next)
  syncPublicPromo(itemId, next)
  return catalogItem(found.item, found.category.id, found.category.name)
}

/** Simulate another editor winning the optimistic-concurrency race. */
export function bumpMockPromoTokenForTests(itemId: string) {
  const current = rawPromos.get(itemId)
  if (!current) return
  rawPromos.set(itemId, { ...current, updatedAt: timestamp(++updateSequence) })
}

resetMockAdminForTests()
