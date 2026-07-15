/**
 * Test-only administrative state. It mirrors the Session 4 API enough for the
 * website panel to exercise its full create/edit flow without mutating a
 * deployed environment. Public home fixtures are updated only for site
 * content, which keeps the store-badge contract observable in integration
 * tests.
 */
import type {
  AdminBanner,
  AdminBannerCreate,
  AdminBannerUpdate,
  AdminBranch,
  AdminBranchCreate,
  AdminBranchUpdate,
  AdminRestaurant,
  AdminRestaurantCreate,
  AdminRestaurantUpdate,
  ImageUploadRequest,
  ImageUploadResponse,
  OvenFeature,
  OvenFeatureCreate,
  OvenFeatureUpdate,
  SiteContentEntry,
  SiteContentKey,
  SiteContentUpdate,
} from '@/api/types'

import { ApiError } from '../errors'
import { allRestaurants, branches, menus, mockMarketplace } from './data'

const DRAFT_RESTAURANT_ID = 'a5000000-0000-4000-8000-000000000005'
const INITIAL_UPDATED_AT = '2026-07-12T09:00:00.000Z'
const IMAGE_BASE_URL = 'https://assets.example.test'

let sequence = 0
let restaurants = new Map<string, AdminRestaurant>()
let adminBranches = new Map<string, AdminBranch>()
let banners = new Map<string, AdminBanner>()
let ovenFeatures = new Map<string, OvenFeature>()
let content = new Map<SiteContentKey, SiteContentEntry>()
let managerMembershipBranchIds = new Set<string>()

function timestamp(): string {
  sequence += 1
  return new Date(Date.parse(INITIAL_UPDATED_AT) + sequence).toISOString()
}

function fail(status: number, code: string, message: string, details?: Record<string, unknown>): never {
  throw new ApiError(status, { code, message, ...(details ? { details } : {}) })
}

/**
 * Mirrors the live API's fulfillment write path: null is rejected for the tiered fields, and
 * omitting them resets to the server defaults (5 km base, flat fee) instead of preserving the
 * stored values. Keeping that behavior here lets tests catch saves that would wipe tiered pricing.
 */
function resolveFulfillment(input: AdminBranchCreate['fulfillment']): AdminBranch['fulfillment'] {
  if (input && (input.deliveryBaseRadiusKm === null || input.deliveryPerKmCents === null)) {
    fail(422, 'validation_failed', 'deliveryBaseRadiusKm and deliveryPerKmCents cannot be null.')
  }
  const collectionEnabled = input?.collectionEnabled ?? true
  const deliveryEnabled = input?.deliveryEnabled ?? false
  return {
    collectionEnabled,
    deliveryEnabled,
    deliveryFeeCents: deliveryEnabled ? (input?.deliveryFeeCents ?? 0) : 0,
    minOrderCents: deliveryEnabled ? (input?.minOrderCents ?? null) : null,
    deliveryRadiusKm: deliveryEnabled ? (input?.deliveryRadiusKm ?? null) : null,
    deliveryBaseRadiusKm: deliveryEnabled ? (input?.deliveryBaseRadiusKm ?? 5) : 5,
    deliveryPerKmCents: deliveryEnabled ? (input?.deliveryPerKmCents ?? 0) : 0,
  }
}

function cloneBranch(branch: AdminBranch): AdminBranch {
  return {
    ...branch,
    address: { ...branch.address },
    fulfillment: { ...branch.fulfillment },
    payment: { ...branch.payment },
    pos: { ...branch.pos },
    openingHours: branch.openingHours.map((hours) => ({ ...hours })),
  }
}

function imageUrl(objectKey: string | null | undefined): string | null {
  return objectKey ? `${IMAGE_BASE_URL}/${encodeURIComponent(objectKey)}` : null
}

function slugify(value: string): string {
  const slug = value
    .toLocaleLowerCase('en-IE')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `restaurant-${sequence + 1}`
}

function checkConcurrency<T extends { updatedAt: string }>(
  item: T,
  expectedUpdatedAt: string | undefined,
): void {
  if (expectedUpdatedAt && expectedUpdatedAt !== item.updatedAt) {
    fail(409, 'conflict', 'This record changed since it was loaded.')
  }
}

function findMenuItem(menuItemId: string): { name: string; branchId: string } | null {
  for (const [branchId, menu] of Object.entries(menus)) {
    for (const category of menu.categories) {
      const item = category.items.find((candidate) => candidate.id === menuItemId)
      if (item) return { name: item.name, branchId }
    }
  }
  return null
}

function requireRestaurant(restaurantId: string): AdminRestaurant {
  const restaurant = restaurants.get(restaurantId)
  if (!restaurant) fail(404, 'not_found', 'Restaurant not found.')
  return restaurant
}

function requireBranch(branchId: string): AdminBranch {
  const branch = adminBranches.get(branchId)
  if (!branch) fail(404, 'not_found', 'Branch not found.')
  return branch
}

function requireBanner(bannerId: string): AdminBanner {
  const banner = banners.get(bannerId)
  if (!banner) fail(404, 'not_found', 'Banner not found.')
  return banner
}

function requireOvenFeature(featureId: string): OvenFeature {
  const feature = ovenFeatures.get(featureId)
  if (!feature) fail(404, 'not_found', 'Oven feature not found.')
  return feature
}

function assertWindow(startsAt: string | null | undefined, endsAt: string | null | undefined) {
  if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) {
    fail(422, 'validation_failed', 'The end must be after the start.')
  }
}

function assertBannerScope(restaurantId: string | null, branchId: string | null) {
  if (branchId && !restaurantId) {
    fail(422, 'validation_failed', 'A branch-scoped banner must also name its restaurant.')
  }
  if (restaurantId) requireRestaurant(restaurantId)
  if (branchId && requireBranch(branchId).restaurantId !== restaurantId) {
    fail(422, 'validation_failed', 'The selected branch does not belong to that restaurant.')
  }
}

function assertPublishable(restaurantId: string) {
  const missingBranches = [...adminBranches.values()]
    .filter((branch) => branch.restaurantId === restaurantId && branch.isOpen)
    .filter((branch) => !managerMembershipBranchIds.has(branch.id))
    .map((branch) => ({ id: branch.id, name: branch.name }))
  if (missingBranches.length > 0) {
    fail(
      422,
      'publication_blocked',
      'Every order-enabled branch must have a manager before the restaurant can be published.',
      { missingBranches },
    )
  }
}

function publicContentKey(key: SiteContentKey): key is Exclude<SiteContentKey, 'geoRadiusKmDefault' | 'promosEnabled'> {
  return key !== 'geoRadiusKmDefault' && key !== 'promosEnabled'
}

function syncPublicContent(entry: SiteContentEntry) {
  if (!publicContentKey(entry.key)) return
  mockMarketplace.content = {
    ...mockMarketplace.content,
    [entry.key]: entry.value as string | null,
  }
}

function validateContentValue(key: SiteContentKey, value: SiteContentEntry['value']) {
  if (key === 'geoRadiusKmDefault') {
    if (typeof value !== 'number' || value <= 0) {
      fail(422, 'validation_failed', 'The default geo radius must be a positive number.')
    }
    return
  }
  if (key === 'promosEnabled') {
    if (typeof value !== 'boolean') fail(422, 'validation_failed', 'Promos enabled must be true or false.')
    return
  }
  if (value !== null && typeof value !== 'string') {
    fail(422, 'validation_failed', 'This content key accepts text or a cleared value.')
  }
  if ((key === 'appStoreUrl' || key === 'playStoreUrl') && value !== null) {
    if (!value.startsWith('https://')) {
      fail(422, 'validation_failed', 'Store links must use https.')
    }
  }
}

function uploadResponse(prefix: string, input: ImageUploadRequest): ImageUploadResponse {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.contentType)) {
    fail(422, 'validation_failed', 'Use a JPEG, PNG, or WebP image.')
  }
  if (input.contentLengthBytes > 5 * 1024 * 1024) {
    fail(422, 'validation_failed', 'Images must be 5 MiB or smaller.')
  }
  const objectKey = `tmp/admin/mock/${prefix}/${crypto.randomUUID()}`
  return {
    uploadUrl: `mock-upload://${objectKey}`,
    objectKey,
    publicUrl: imageUrl(objectKey)!,
    expiresInSeconds: 900,
  }
}

export function resetMockAdminContentForTests() {
  sequence = 0
  restaurants = new Map(
    allRestaurants.map((restaurant) => [
      restaurant.id,
      {
        id: restaurant.id,
        slug: restaurant.slug,
        name: restaurant.name,
        description: restaurant.description ?? null,
        tagline: restaurant.tagline ?? null,
        logoUrl: restaurant.logoUrl ?? null,
        heroImageUrl: restaurant.heroImageUrl ?? null,
        heroImageAlt: restaurant.heroImageAlt ?? null,
        lifecycleStatus: 'published' as const,
        isPaused: restaurant.marketplaceStatus === 'paused',
        createdAt: '2026-07-01T09:00:00.000Z',
        updatedAt: INITIAL_UPDATED_AT,
      },
    ]),
  )
  restaurants.set(DRAFT_RESTAURANT_ID, {
    id: DRAFT_RESTAURANT_ID,
    slug: 'harbour-kitchen',
    name: 'Harbour Kitchen',
    description: 'A pre-publication fixture for the admin panel.',
    tagline: 'Draft only.',
    logoUrl: null,
    heroImageUrl: null,
    heroImageAlt: null,
    lifecycleStatus: 'draft',
    isPaused: false,
    createdAt: '2026-07-13T09:00:00.000Z',
    updatedAt: INITIAL_UPDATED_AT,
  })

  adminBranches = new Map(
    Object.entries(branches).map(([branchId, branch]) => [
      branchId,
      {
        ...cloneBranch({
          ...branch,
          createdAt: '2026-07-01T09:00:00.000Z',
          updatedAt: INITIAL_UPDATED_AT,
        }),
      },
    ]),
  )
  managerMembershipBranchIds = new Set(Object.keys(branches))

  banners = new Map(
    mockMarketplace.banners.map((banner) => [
      banner.id,
      {
        ...banner,
        restaurantId: null,
        branchId: null,
        sortOrder: 0,
        isActive: true,
        startsAt: null,
        endsAt: null,
        createdAt: '2026-07-01T09:00:00.000Z',
        updatedAt: INITIAL_UPDATED_AT,
      },
    ]),
  )
  ovenFeatures = new Map(
    mockMarketplace.ovenPicks.map((pick, index) => {
      const item = findMenuItem(pick.itemId)
      const branch = adminBranches.get(pick.branchId)
      const id = `oven-${index + 1}`
      return [
        id,
        {
          id,
          branchId: pick.branchId,
          menuItemId: pick.itemId,
          itemName: item?.name ?? null,
          branchName: branch?.name ?? null,
          blurb: null,
          sortOrder: index,
          isActive: true,
          startsAt: null,
          endsAt: null,
          createdAt: '2026-07-01T09:00:00.000Z',
          updatedAt: INITIAL_UPDATED_AT,
        },
      ]
    }),
  )
  const contentEntries: Array<[SiteContentKey, SiteContentEntry]> = [
    ['heroHeading', { key: 'heroHeading', value: mockMarketplace.content.heroHeading, updatedAt: INITIAL_UPDATED_AT }],
    ['heroSubheading', { key: 'heroSubheading', value: mockMarketplace.content.heroSubheading, updatedAt: INITIAL_UPDATED_AT }],
    ['ovenSectionTitle', { key: 'ovenSectionTitle', value: mockMarketplace.content.ovenSectionTitle, updatedAt: INITIAL_UPDATED_AT }],
    ['discountedSectionTitle', { key: 'discountedSectionTitle', value: mockMarketplace.content.discountedSectionTitle, updatedAt: INITIAL_UPDATED_AT }],
    ['branchesSectionTitle', { key: 'branchesSectionTitle', value: mockMarketplace.content.branchesSectionTitle, updatedAt: INITIAL_UPDATED_AT }],
    ['footerNote', { key: 'footerNote', value: mockMarketplace.content.footerNote, updatedAt: INITIAL_UPDATED_AT }],
    ['appStoreUrl', { key: 'appStoreUrl', value: mockMarketplace.content.appStoreUrl, updatedAt: INITIAL_UPDATED_AT }],
    ['playStoreUrl', { key: 'playStoreUrl', value: mockMarketplace.content.playStoreUrl, updatedAt: INITIAL_UPDATED_AT }],
    ['geoRadiusKmDefault', { key: 'geoRadiusKmDefault', value: 15, updatedAt: INITIAL_UPDATED_AT }],
    ['promosEnabled', { key: 'promosEnabled', value: true, updatedAt: INITIAL_UPDATED_AT }],
  ]
  content = new Map(contentEntries)
}

export function listAdminRestaurantsForTests(): AdminRestaurant[] {
  return [...restaurants.values()].map((restaurant) => ({ ...restaurant }))
}

export function createAdminRestaurantForTests(input: AdminRestaurantCreate): AdminRestaurant {
  const id = crypto.randomUUID()
  const slug = input.slug === undefined || input.slug === null ? slugify(input.name) : input.slug
  if ([...restaurants.values()].some((restaurant) => restaurant.slug === slug)) {
    fail(409, 'conflict', 'That slug is already in use by another restaurant.')
  }
  const restaurant: AdminRestaurant = {
    id,
    slug,
    name: input.name,
    description: input.description ?? null,
    tagline: input.tagline ?? null,
    logoUrl: imageUrl(input.logoObjectKey),
    heroImageUrl: imageUrl(input.heroImageObjectKey),
    heroImageAlt: input.heroImageAlt ?? null,
    lifecycleStatus: 'draft',
    isPaused: false,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }
  restaurants.set(id, restaurant)
  return { ...restaurant }
}

export function updateAdminRestaurantForTests(
  restaurantId: string,
  input: AdminRestaurantUpdate,
  expectedUpdatedAt?: string,
): AdminRestaurant {
  const current = requireRestaurant(restaurantId)
  checkConcurrency(current, expectedUpdatedAt)
  if (input.lifecycleStatus === 'published' && current.lifecycleStatus !== 'published') {
    assertPublishable(restaurantId)
  }
  if (input.lifecycleStatus === 'published' && current.lifecycleStatus === 'archived') {
    fail(409, 'conflict', 'An archived restaurant cannot be published again.')
  }
  if (input.slug !== undefined && current.lifecycleStatus !== 'draft') {
    fail(422, 'validation_failed', 'The slug can only be changed while the restaurant is a draft.')
  }
  const next: AdminRestaurant = {
    ...current,
    ...input,
    ...(input.logoObjectKey !== undefined ? { logoUrl: imageUrl(input.logoObjectKey) } : {}),
    ...(input.heroImageObjectKey !== undefined ? { heroImageUrl: imageUrl(input.heroImageObjectKey) } : {}),
    updatedAt: timestamp(),
  }
  restaurants.set(restaurantId, next)
  return { ...next }
}

export function listAdminBranchesForTests(restaurantId?: string): AdminBranch[] {
  return [...adminBranches.values()]
    .filter((branch) => !restaurantId || branch.restaurantId === restaurantId)
    .map(cloneBranch)
}

export function createAdminBranchForTests(input: AdminBranchCreate): AdminBranch {
  requireRestaurant(input.restaurantId)
  const id = crypto.randomUUID()
  const branch: AdminBranch = {
    id,
    restaurantId: input.restaurantId,
    name: input.name,
    description: input.description ?? null,
    imageUrl: imageUrl(input.imageObjectKey),
    address: {
      line1: input.address.line1,
      line2: input.address.line2 ?? null,
      town: input.address.town,
      county: input.address.county,
      eircode: input.address.eircode,
      latitude: input.address.latitude ?? null,
      longitude: input.address.longitude ?? null,
    },
    timezone: input.timezone,
    isOpen: true,
    fulfillment: resolveFulfillment(input.fulfillment),
    payment: input.payment ?? { cashEnabled: false },
    pos: input.pos ?? {
      deliveryAddressAutocompleteEnabled: false,
      deliveryAddressAutocompleteRadiusKm: 10,
    },
    openingHours: input.openingHours ?? [],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }
  adminBranches.set(id, branch)
  return cloneBranch(branch)
}

export function updateAdminBranchForTests(
  branchId: string,
  input: AdminBranchUpdate,
  expectedUpdatedAt?: string,
): AdminBranch {
  const current = requireBranch(branchId)
  checkConcurrency(current, expectedUpdatedAt)
  const next = cloneBranch({
    ...current,
    ...input,
    ...(input.fulfillment !== undefined ? { fulfillment: resolveFulfillment(input.fulfillment) } : {}),
    ...(input.imageObjectKey !== undefined ? { imageUrl: imageUrl(input.imageObjectKey) } : {}),
    updatedAt: timestamp(),
  })
  adminBranches.set(branchId, next)
  return cloneBranch(next)
}

export function listAdminBannersForTests(): AdminBanner[] {
  return [...banners.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((banner) => ({ ...banner }))
}

export function createAdminBannerForTests(input: AdminBannerCreate): AdminBanner {
  assertBannerScope(input.restaurantId ?? null, input.branchId ?? null)
  assertWindow(input.startsAt, input.endsAt)
  const banner: AdminBanner = {
    id: crypto.randomUUID(),
    title: input.title,
    body: input.body ?? null,
    imageUrl: imageUrl(input.imageObjectKey),
    linkUrl: input.linkUrl ?? null,
    restaurantId: input.restaurantId ?? null,
    branchId: input.branchId ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }
  banners.set(banner.id, banner)
  return { ...banner }
}

export function updateAdminBannerForTests(
  bannerId: string,
  input: AdminBannerUpdate,
  expectedUpdatedAt?: string,
): AdminBanner {
  const current = requireBanner(bannerId)
  checkConcurrency(current, expectedUpdatedAt)
  const next = {
    ...current,
    ...input,
    ...(input.imageObjectKey !== undefined ? { imageUrl: imageUrl(input.imageObjectKey) } : {}),
    updatedAt: timestamp(),
  }
  assertBannerScope(next.restaurantId ?? null, next.branchId ?? null)
  assertWindow(next.startsAt, next.endsAt)
  banners.set(bannerId, next)
  return { ...next }
}

export function deleteAdminBannerForTests(bannerId: string): void {
  requireBanner(bannerId)
  banners.delete(bannerId)
}

export function listAdminOvenFeaturesForTests(branchId?: string): OvenFeature[] {
  return [...ovenFeatures.values()]
    .filter((feature) => !branchId || feature.branchId === branchId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((feature) => ({ ...feature }))
}

export function createAdminOvenFeatureForTests(input: OvenFeatureCreate): OvenFeature {
  const branch = requireBranch(input.branchId)
  const item = findMenuItem(input.menuItemId)
  if (!item || item.branchId !== input.branchId) {
    fail(422, 'validation_failed', 'The menu item must belong to the selected branch.')
  }
  assertWindow(input.startsAt, input.endsAt)
  const feature: OvenFeature = {
    id: crypto.randomUUID(),
    branchId: input.branchId,
    menuItemId: input.menuItemId,
    itemName: item.name,
    branchName: branch.name,
    blurb: input.blurb ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }
  ovenFeatures.set(feature.id, feature)
  return { ...feature }
}

export function updateAdminOvenFeatureForTests(
  featureId: string,
  input: OvenFeatureUpdate,
  expectedUpdatedAt?: string,
): OvenFeature {
  const current = requireOvenFeature(featureId)
  checkConcurrency(current, expectedUpdatedAt)
  const next = { ...current, ...input, updatedAt: timestamp() }
  assertWindow(next.startsAt, next.endsAt)
  ovenFeatures.set(featureId, next)
  return { ...next }
}

export function deleteAdminOvenFeatureForTests(featureId: string): void {
  requireOvenFeature(featureId)
  ovenFeatures.delete(featureId)
}

export function listAdminContentForTests(): SiteContentEntry[] {
  return [...content.values()].map((entry) => ({ ...entry }))
}

export function setAdminContentForTests(
  key: SiteContentKey,
  input: SiteContentUpdate,
  expectedUpdatedAt?: string,
): SiteContentEntry {
  const current = content.get(key)
  if (!current) fail(404, 'not_found', 'Content key not found.')
  checkConcurrency(current, expectedUpdatedAt)
  validateContentValue(key, input.value)
  const next = { key, value: input.value, updatedAt: timestamp() }
  content.set(key, next)
  syncPublicContent(next)
  return { ...next }
}

export function requestAdminImageForTests(
  prefix: string,
  input: ImageUploadRequest,
): ImageUploadResponse {
  return uploadResponse(prefix, input)
}

export async function uploadAdminImageForTests(): Promise<void> {
  // The real request streams to S3. In test-only mock mode, attachment is
  // represented by submitting the returned temporary object key to a mutation.
}

resetMockAdminContentForTests()
